// The teacher's view of a group, a student and the questions. Plain functions
// over the saved history (history.ts), reusing the student-side progress
// rules (progress.ts) so a status means the same thing everywhere.

import { INACTIVE_DAYS, OVERCONFIDENT_MIN_SURE, OVERCONFIDENT_WRONG_SHARE, QUESTION_HEALTH } from './config';
import type { ChoiceRow, GroupHistory, GroupStudentInfo, History } from './history';
import {
	calibration,
	commandProfile,
	conceptCredits,
	examTechnique,
	figureStatus,
	mistakeList,
	pace,
	specPointMastery,
	topicProgress,
	type QuizInfo
} from './progress';
import { optionText } from '$lib/quiz/draft';
import type { FigureStatus, TopicProgress } from '$lib/quiz/public';
import type { Option, Question, Quiz } from './quiz/types';

const DAY = 24 * 3600_000;
const average = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const reached = (a: { not_reached: number }) => !a.not_reached;

// ---- Per student -------------------------------------------------------------------------

/**
 * Overconfident on a topic: at least OVERCONFIDENT_MIN_SURE answers marked
 * "Sure", and at least OVERCONFIDENT_WRONG_SHARE of them wrong.
 */
export function overconfident(history: History, quizId: string): boolean {
	const sure = history.answers.filter((a) => a.quiz_id === quizId && reached(a) && a.confidence === 'sure');
	return sure.length >= OVERCONFIDENT_MIN_SURE && sure.filter((a) => !a.correct).length / sure.length >= OVERCONFIDENT_WRONG_SHARE;
}

/** No attempts and no notes-page views in INACTIVE_DAYS. */
export function inactive(history: History, now = Date.now()): boolean {
	const times = [...history.attempts.map((a) => a.completed_at), ...history.pages.map((p) => p.last_viewed)].map(Date.parse);
	return times.length === 0 || now - Math.max(...times) > INACTIVE_DAYS * DAY;
}

export interface StudentProfile {
	student: { id: number; username: string; group_id: number; last_active_at: string | null };
	topics: (TopicProgress & { overconfident: boolean })[];
	calibration: ReturnType<typeof calibration>;
	command_profile: ReturnType<typeof commandProfile>;
	exam_technique: ReturnType<typeof examTechnique>;
	pace: ReturnType<typeof pace>;
	timed_scores: { completed_at: string; score: number; reached: number; overtime: boolean }[];
	mistakes: number;
	inactive: boolean;
	attempts: { id: number; mode: string; quiz_id: string | null; score: number; max_score: number; completed_at: string; questions: number }[];
}

export function studentProfile(student: GroupStudentInfo, history: History, quizzes: QuizInfo[], now = Date.now()): StudentProfile {
	const servable = new Set(quizzes.flatMap((q) => q.question_ids));
	return {
		student,
		topics: quizzes.map((q) => ({ ...topicProgress(q, history, now), overconfident: overconfident(history, q.id) })),
		calibration: calibration(history.answers),
		command_profile: commandProfile(history.answers),
		exam_technique: examTechnique(history.answers),
		pace: pace(history),
		timed_scores: history.attempts
			.filter((a) => a.mode === 'timed')
			.map((a) => {
				const rows = history.answers.filter((r) => r.attempt_id === a.id);
				return {
					completed_at: a.completed_at,
					score: a.max_score ? a.score / a.max_score : 0,
					reached: rows.length ? rows.filter(reached).length / rows.length : 0,
					overtime: !!a.overtime
				};
			}),
		mistakes: mistakeList(history.answers).filter((m) => servable.has(m.question_id)).length,
		inactive: inactive(history, now),
		attempts: [...history.attempts].reverse().map((a) => ({
			id: a.id,
			mode: a.mode,
			quiz_id: a.quiz_id,
			score: a.score,
			max_score: a.max_score,
			completed_at: a.completed_at,
			questions: a.question_count
		}))
	};
}

// ---- The group heatmap ----------------------------------------------------------------------

export type HeatmapBy = 'topic' | 'spec_point' | 'command';

export interface HeatmapCell {
	/** 0–1, or null if the student hasn't answered anything here. */
	value: number | null;
	status: TopicProgress['status'];
	label: string;
	/** Topic view only. */
	note?: string;
	overconfident?: boolean;
}

export interface Heatmap {
	by: HeatmapBy;
	columns: { key: string; label: string }[];
	rows: { student_id: number; username: string; cells: HeatmapCell[] }[];
}

const notStarted: HeatmapCell = { value: null, status: 'not_started', label: 'Not started' };
const cellFor = (value: number): HeatmapCell => ({ value, ...figureStatus(value) });

export function heatmap(by: HeatmapBy, group: GroupHistory, quizzes: QuizInfo[], now = Date.now()): Heatmap {
	const histories = group.students.map((s) => ({ s, h: group.histories.get(s.id)! }));
	if (by === 'topic') {
		return {
			by,
			columns: quizzes.map((q) => ({ key: q.id, label: q.title })),
			rows: histories.map(({ s, h }) => ({
				student_id: s.id,
				username: s.username,
				cells: quizzes.map((q) => {
					const p = topicProgress(q, h, now);
					return {
						value: p.mastery ?? null,
						status: p.status,
						label: p.label,
						...(p.note && { note: p.note }),
						overconfident: overconfident(h, q.id)
					};
				})
			}))
		};
	}
	const perStudent = histories.map(({ s, h }) => ({
		s,
		values: new Map(
			by === 'spec_point'
				? specPointMastery(h.answers).map((x) => [x.spec_point, x.mastery] as const)
				: commandProfile(h.answers).map((x) => [x.command, x.credit] as const)
		)
	}));
	const keys = [...new Set(perStudent.flatMap((p) => [...p.values.keys()]))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
	return {
		by,
		columns: keys.map((key) => ({ key, label: key })),
		rows: perStudent.map(({ s, values }) => ({
			student_id: s.id,
			username: s.username,
			cells: keys.map((k) => (values.has(k) ? cellFor(values.get(k)!) : notStarted))
		}))
	};
}

// ---- The group summary -----------------------------------------------------------------------

export interface GroupSummary {
	weakest_spec_points: { spec_point: string; mastery: number; students: number }[];
	command_profile: { command: string; credit: number; students: number }[];
	exam_technique: {
		by_format: ({ key: string; credit: number; answers: number } & FigureStatus)[];
		by_command: ({ key: string; credit: number; answers: number } & FigureStatus)[];
	} | null;
	pace: { students: number; reached: number | null; seconds_per_mark: number | null; target_seconds_per_mark: number } | null;
	inactive: { id: number; username: string }[];
	topics: {
		quiz_id: string;
		title: string;
		students: number;
		starting_point: number | null;
		latest: number | null;
		/** Of the starting points, how many were taken before the notes were opened. */
		before_notes: number;
		after_notes: number;
		overconfident: { id: number; username: string }[];
	}[];
}

/** Average of one figure across students, with how many students it covers. */
function poolBy<T>(items: T[], key: (t: T) => string, value: (t: T) => number) {
	const m = new Map<string, number[]>();
	for (const it of items) m.set(key(it), [...(m.get(key(it)) ?? []), value(it)]);
	return [...m].map(([k, vs]) => ({ key: k, value: average(vs)!, count: vs.length }));
}

export function groupSummary(group: GroupHistory, quizzes: QuizInfo[], now = Date.now()): GroupSummary {
	const students = group.students.map((s) => ({ s, h: group.histories.get(s.id)! }));

	const specs = poolBy(
		students.flatMap(({ h }) => specPointMastery(h.answers)),
		(x) => x.spec_point,
		(x) => x.mastery
	);
	const commands = poolBy(
		students.flatMap(({ h }) => commandProfile(h.answers)),
		(x) => x.command,
		(x) => x.credit
	);

	// Exam technique: every student's latest exam_skill answers, pooled.
	const techniques = students.map(({ h }) => examTechnique(h.answers)).filter((t) => t !== null);
	const pool = (groups: { key: string; credit: number; answers: number }[][]) =>
		poolBy(groups.flat(), (g) => g.key, (g) => g.credit).map((p) => ({
			key: p.key,
			credit: p.value,
			answers: groups.flat().filter((g) => g.key === p.key).reduce((s, g) => s + g.answers, 0),
			...figureStatus(p.value)
		}));

	const paces = students.map(({ h }) => pace(h)).filter((p) => p !== null && p.attempts > 0);

	return {
		weakest_spec_points: specs
			.sort((a, b) => a.value - b.value)
			.slice(0, 3)
			.map((x) => ({ spec_point: x.key, mastery: x.value, students: x.count })),
		command_profile: commands.map((x) => ({ command: x.key, credit: x.value, students: x.count })).sort((a, b) => a.credit - b.credit),
		exam_technique: techniques.length
			? { by_format: pool(techniques.map((t) => t.by_format)), by_command: pool(techniques.map((t) => t.by_command)) }
			: null,
		pace: paces.length
			? {
					students: paces.length,
					reached: average(paces.map((p) => p!.reached).filter((x): x is number => x !== null)),
					seconds_per_mark: average(paces.map((p) => p!.seconds_per_mark).filter((x): x is number => x !== null)),
					target_seconds_per_mark: paces[0]!.target_seconds_per_mark
				}
			: null,
		inactive: students.filter(({ h }) => inactive(h, now)).map(({ s }) => ({ id: s.id, username: s.username })),
		topics: quizzes.map((q) => {
			const progress = students.map(({ s, h }) => ({ s, h, p: topicProgress(q, h, now) }));
			const started = progress.filter((x) => x.p.starting_point !== undefined);
			return {
				quiz_id: q.id,
				title: q.title,
				students: started.length,
				starting_point: average(started.map((x) => x.p.starting_point!)),
				latest: average(started.map((x) => x.p.latest!)),
				before_notes: started.filter((x) => x.p.before_notes).length,
				after_notes: started.filter((x) => !x.p.before_notes).length,
				overconfident: progress.filter((x) => overconfident(x.h, q.id)).map((x) => ({ id: x.s.id, username: x.s.username }))
			};
		})
	};
}

// ---- Questions -------------------------------------------------------------------------------

/** The answer-tier and reason-tier option indexes in a saved `chosen`. */
function picked(chosen: string | null): { answer: number[]; reason: number | null } {
	if (chosen === null) return { answer: [], reason: null };
	const c = JSON.parse(chosen);
	if (Array.isArray(c)) return { answer: c, reason: null };
	if (typeof c === 'object' && c !== null) return { answer: [c.answer], reason: c.reason };
	return { answer: [c], reason: null };
}

function correctSets(q: Question): { answer: Set<number>; reason: Set<number> | null } {
	if (q.type === 'multi') return { answer: new Set(q.answer), reason: null };
	if (q.type === 'two_tier') return { answer: new Set([q.answer]), reason: new Set([q.reason.answer]) };
	return { answer: new Set([q.answer]), reason: null };
}

export interface OptionStat {
	tier: 'answer' | 'reason';
	index: number;
	text: string;
	correct: boolean;
	/** Share of the question's answers that chose this option. */
	rate: number;
	why_wrong: string | null;
}

export interface QuestionStat {
	question_id: string;
	quiz_id: string;
	text: string;
	type: string;
	answers: number;
	correct_rate: number;
	dont_know_rate: number;
	/** Wrong, and marked "Sure": the most stubborn misconceptions. */
	confidently_wrong_rate: number;
	most_common_wrong: { text: string; why_wrong: string | null; rate: number } | null;
	options: OptionStat[];
}

export type QuestionIndex = Map<string, { quiz: Quiz; q: Question }>;

export function indexQuestions(quizzes: readonly Quiz[]): QuestionIndex {
	return new Map(quizzes.flatMap((quiz) => quiz.questions.map((q) => [q.id, { quiz, q }] as const)));
}

/** Per-question figures from saved answers, sorted by confidently-wrong rate (highest first). */
export function questionStats(choices: ChoiceRow[], index: QuestionIndex): QuestionStat[] {
	const byQuestion = new Map<string, ChoiceRow[]>();
	for (const c of choices) if (reached(c)) byQuestion.set(c.question_id, [...(byQuestion.get(c.question_id) ?? []), c]);

	const stats: QuestionStat[] = [];
	for (const [id, rows] of byQuestion) {
		const entry = index.get(id);
		if (!entry) continue; // a question since removed from the bank
		const { q, quiz } = entry;
		const n = rows.length;
		const sets = correctSets(q);
		const answerCounts = new Array(q.options.length).fill(0);
		const reasonCounts = q.type === 'two_tier' ? new Array(q.reason.options.length).fill(0) : [];
		for (const r of rows) {
			const p = picked(r.chosen);
			for (const i of p.answer) if (i in answerCounts) answerCounts[i]++;
			if (p.reason !== null && p.reason in reasonCounts) reasonCounts[p.reason]++;
		}
		const describe = (tier: 'answer' | 'reason', opts: Option[], counts: number[], correct: Set<number>): OptionStat[] =>
			opts.map((o, i) => ({ tier, index: i, text: optionText(o), correct: correct.has(i), rate: counts[i] / n, why_wrong: o.why_wrong ?? null }));
		const options = [
			...describe('answer', q.options, answerCounts, sets.answer),
			...(q.type === 'two_tier' ? describe('reason', q.reason.options, reasonCounts, sets.reason!) : [])
		];
		const wrong = options.filter((o) => !o.correct && o.rate > 0).sort((a, b) => b.rate - a.rate);
		stats.push({
			question_id: id,
			quiz_id: quiz.id,
			text: q.text,
			type: q.type,
			answers: n,
			correct_rate: rows.filter((r) => r.correct).length / n,
			dont_know_rate: rows.filter((r) => r.dont_know).length / n,
			confidently_wrong_rate: rows.filter((r) => !r.correct && r.confidence === 'sure').length / n,
			most_common_wrong: wrong[0] ? { text: wrong[0].text, why_wrong: wrong[0].why_wrong, rate: wrong[0].rate } : null,
			options
		});
	}
	return stats.sort((a, b) => b.confidently_wrong_rate - a.confidently_wrong_rate || b.answers - a.answers);
}

export interface HealthFlag {
	kind: 'option_not_working' | 'too_easy' | 'poor_discrimination' | 'high_dont_know';
	text: string;
}

export interface QuestionHealth extends QuestionStat {
	/** Where to edit it. */
	file: string;
	discrimination: number | null;
	flags: HealthFlag[];
}

/**
 * Overall mastery for each student (average credit over every knowledge
 * concept they've answered), used to split students into thirds.
 */
function overallMastery(group: GroupHistory): Map<number, number> {
	const out = new Map<number, number>();
	for (const [id, h] of group.histories) {
		const credits = [...conceptCredits(h.answers).values()].map((c) => c.credit);
		if (credits.length) out.set(id, average(credits)!);
	}
	return out;
}

/**
 * Question health, for improving the questions. Only questions with at least
 * QUESTION_HEALTH.min_answers answers are judged:
 * - option not working: a wrong option chosen in under 5% of answers
 * - too easy: over 90% correct
 * - poor discrimination: top third of students (by overall mastery) minus the
 *   bottom third, in correct rate, below 0.1
 * - high "I don't know": over 40%
 */
export function questionHealth(group: GroupHistory, index: QuestionIndex): QuestionHealth[] {
	const H = QUESTION_HEALTH;
	const mastery = [...overallMastery(group)].sort((a, b) => a[1] - b[1]);
	const third = Math.floor(mastery.length / 3);
	const bottom = new Set(mastery.slice(0, third).map(([id]) => id));
	const top = new Set(mastery.slice(mastery.length - third).map(([id]) => id));

	return questionStats(group.choices, index)
		.filter((s) => s.answers >= H.min_answers)
		.map((s) => {
			const rows = group.choices.filter((c) => c.question_id === s.question_id && reached(c));
			const rate = (ids: Set<number>) => {
				const rs = rows.filter((r) => ids.has(r.student_id));
				return rs.length ? rs.filter((r) => r.correct).length / rs.length : null;
			};
			const hi = third > 0 ? rate(top) : null;
			const lo = third > 0 ? rate(bottom) : null;
			const discrimination = hi !== null && lo !== null ? hi - lo : null;

			const flags: HealthFlag[] = [];
			for (const o of s.options) {
				if (!o.correct && o.rate < H.option_min_rate) {
					flags.push({ kind: 'option_not_working', text: `"${o.text}" chosen in ${Math.round(o.rate * 100)}% of answers` });
				}
			}
			if (s.correct_rate > H.too_easy) flags.push({ kind: 'too_easy', text: `${Math.round(s.correct_rate * 100)}% correct` });
			if (discrimination !== null && discrimination < H.min_discrimination) {
				flags.push({ kind: 'poor_discrimination', text: `top third ${Math.round(hi! * 100)}% vs bottom third ${Math.round(lo! * 100)}% correct` });
			}
			if (s.dont_know_rate > H.high_dont_know) {
				flags.push({ kind: 'high_dont_know', text: `${Math.round(s.dont_know_rate * 100)}% "I don't know"` });
			}
			return { ...s, file: `content/quizzes/${s.quiz_id}.yml`, discrimination, flags };
		})
		.sort((a, b) => b.flags.length - a.flags.length || a.question_id.localeCompare(b.question_id));
}

// ---- Markbook -------------------------------------------------------------------------------

/** One row per student for the markbook CSV. */
export function markbook(group: GroupHistory, quizzes: QuizInfo[], now = Date.now()): string[][] {
	const pct = (x: number | undefined | null) => (x === undefined || x === null ? '' : String(Math.round(x * 100)));
	const header = [
		'username',
		'last active',
		...quizzes.flatMap((q) => [`${q.title}: status`, `${q.title}: mastery %`, `${q.title}: starting point %`, `${q.title}: latest %`]),
		'exam technique %',
		'mistakes waiting',
		'topics attempted'
	];
	const rows = group.students.map((s) => {
		const p = studentProfile(s, group.histories.get(s.id)!, quizzes, now);
		return [
			s.username,
			s.last_active_at?.slice(0, 10) ?? '',
			...p.topics.flatMap((t) => [t.note ? `${t.label} (${t.note})` : t.label, pct(t.mastery), pct(t.starting_point), pct(t.latest)]),
			pct(p.exam_technique?.credit),
			String(p.mistakes),
			`${p.topics.filter((t) => t.status !== 'not_started').length} of ${quizzes.length}`
		];
	});
	return [header, ...rows];
}

