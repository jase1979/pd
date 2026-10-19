// Every progress figure, calculated from a student's history (history.ts).
// Plain functions with no database, so each rule in the spec has a test.
//
// The rules, briefly (thresholds are in config.ts):
// - Answer credit is marks / max_marks. Confidence never affects it, and
//   "I don't know" scores 0, like a wrong answer.
// - Concept credit is the credit of the most recent answer to any question
//   with that concept, in any saved mode. One exception: an answer given in
//   "Practise my mistakes" never LOWERS a concept's credit, so practising
//   mistakes can only help.
// - Topic mastery is the average concept credit over the concepts answered.
// - exam_skill answers test technique, not topic knowledge: they never count
//   towards mastery, coverage, spec points or the command-word profile.
// - "Not reached" answers in timed practice count for nothing except pace.

import {
	CALIBRATION_GUESS_GOOD,
	CALIBRATION_GUESS_MIN,
	CALIBRATION_MIN_RATED,
	CALIBRATION_SURE_GOOD,
	CALIBRATION_SURE_POOR,
	EXAM_TECHNIQUE_LATEST,
	GETTING_THERE_MASTERY,
	OVERTIME_GRACE_S,
	REVIEW_DUE_DAYS,
	SECONDS_PER_MARK,
	SECURE_COVERAGE,
	SECURE_MASTERY,
	SPACING_HOURS,
	TIME_ZONE
} from './config';
import type { AnswerRow, AttemptRow, History } from './history';
import type {
	Calibration,
	ExamTechnique,
	FigureStatus,
	Pace,
	ProgressData,
	Suggestion,
	TopicProgress
} from '$lib/quiz/public';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export const credit = (a: Pick<AnswerRow, 'marks' | 'max_marks'>) => (a.max_marks > 0 ? a.marks / a.max_marks : 0);
const reached = (a: AnswerRow) => !a.not_reached;
const isKnowledge = (a: AnswerRow) => a.qtype !== 'exam_skill' && reached(a);
const average = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

// ---- Concepts and topics --------------------------------------------------------

export interface ConceptCredit {
	quiz_id: string;
	concept: string;
	spec_point: string;
	credit: number;
	/** When the answer that set this credit was given. */
	at: string;
}

/** The current credit for every (quiz, concept) the student has answered. */
export function conceptCredits(answers: AnswerRow[]): Map<string, ConceptCredit> {
	const out = new Map<string, ConceptCredit>();
	for (const a of answers) {
		if (!isKnowledge(a)) continue;
		const key = `${a.quiz_id}\0${a.concept}`;
		const c = credit(a);
		const prev = out.get(key);
		// Practising mistakes can only help: it never replaces a higher credit.
		if (a.mode === 'mistakes' && prev && c < prev.credit) continue;
		out.set(key, { quiz_id: a.quiz_id, concept: a.concept, spec_point: a.spec_point, credit: c, at: a.answered_at });
	}
	return out;
}

/** True if the counted answers include two given at least SPACING_HOURS apart. */
export function spacingMet(times: string[]): boolean {
	if (times.length < 2) return false;
	const ms = times.map(Date.parse);
	return Math.max(...ms) - Math.min(...ms) >= SPACING_HOURS * HOUR;
}

export const STATUS_LABELS: Record<TopicProgress['status'], string> = {
	secure: 'Secure',
	getting_there: 'Getting there',
	not_secure: 'Not secure yet',
	not_started: 'Not started'
};

/** The label for a mastery figure without the coverage and spacing rules (exam technique). */
export function figureStatus(value: number): FigureStatus {
	if (value >= SECURE_MASTERY) return { status: 'secure', label: STATUS_LABELS.secure };
	if (value >= GETTING_THERE_MASTERY) return { status: 'getting_there', label: STATUS_LABELS.getting_there };
	return { status: 'not_secure', label: STATUS_LABELS.not_secure };
}

export interface QuizInfo {
	id: string;
	title: string;
	unit: string;
	page: string;
	/** Concepts with a question that can be served here (knowledge questions only). */
	concepts: number;
	/** Every question that can be served here, so retired or draft questions don't count as mistakes. */
	question_ids: string[];
}

export function topicProgress(quiz: QuizInfo, history: History, now = Date.now()): TopicProgress {
	const credits = [...conceptCredits(history.answers).values()].filter((c) => c.quiz_id === quiz.id);
	const answered = history.answers.filter((a) => a.quiz_id === quiz.id && reached(a));
	const notesViewed = history.pages.find((p) => p.page_path === quiz.page);
	const base = { quiz_id: quiz.id, title: quiz.title, unit: quiz.unit, page: quiz.page, notes_viewed: !!notesViewed };

	// Starting point / best / latest come from topic-mode attempts only.
	const topicAttempts = history.attempts.filter((a) => a.mode === 'topic' && a.quiz_id === quiz.id && a.max_score > 0);
	const score = (a: AttemptRow) => a.score / a.max_score;
	const first = topicAttempts[0];
	const scores = first
		? {
				starting_point: score(first),
				best: Math.max(...topicAttempts.map(score)),
				latest: score(topicAttempts.at(-1)!),
				improvement: score(topicAttempts.at(-1)!) - score(first),
				// Was the starting point taken before the student opened the notes?
				before_notes: !notesViewed || Date.parse(first.started_at) < Date.parse(notesViewed.first_viewed)
			}
		: {};

	if (credits.length === 0) {
		return { ...base, ...scores, status: 'not_started', label: STATUS_LABELS.not_started };
	}

	const mastery = average(credits.map((c) => c.credit));
	const coverage = quiz.concepts ? Math.min(1, credits.length / quiz.concepts) : 0;
	const spaced = spacingMet(credits.map((c) => c.at));
	const last = answered.at(-1)?.answered_at ?? credits.at(-1)!.at;
	const figures = { ...base, ...scores, mastery, coverage, spacing_met: spaced, last_practised: last };

	if (mastery >= SECURE_MASTERY) {
		if (coverage < SECURE_COVERAGE) {
			return { ...figures, status: 'getting_there', label: STATUS_LABELS.getting_there, note: 'try more questions on this topic' };
		}
		if (!spaced) {
			return { ...figures, status: 'getting_there', label: STATUS_LABELS.getting_there, note: 'come back another day to lock it in' };
		}
		if (now - Date.parse(last) > REVIEW_DUE_DAYS * DAY) {
			return { ...figures, status: 'getting_there', label: STATUS_LABELS.getting_there, note: 'due for review', due_for_review: true };
		}
		return { ...figures, status: 'secure', label: STATUS_LABELS.secure };
	}
	if (mastery >= GETTING_THERE_MASTERY) return { ...figures, status: 'getting_there', label: STATUS_LABELS.getting_there };
	return { ...figures, status: 'not_secure', label: STATUS_LABELS.not_secure };
}

/** Mastery for each spec point, over every concept tagged with it, across all quizzes. */
export function specPointMastery(answers: AnswerRow[]) {
	const bySpec = new Map<string, number[]>();
	for (const c of conceptCredits(answers).values()) bySpec.set(c.spec_point, [...(bySpec.get(c.spec_point) ?? []), c.credit]);
	return [...bySpec].map(([spec_point, cs]) => ({ spec_point, mastery: average(cs), concepts: cs.length }));
}

/** Credit by command word, from each knowledge question's latest answer. */
export function commandProfile(answers: AnswerRow[]) {
	const latest = new Map<string, AnswerRow>();
	for (const a of answers) if (isKnowledge(a)) latest.set(a.question_id, a);
	const byCommand = new Map<string, number[]>();
	for (const a of latest.values()) byCommand.set(a.command, [...(byCommand.get(a.command) ?? []), credit(a)]);
	return [...byCommand].map(([command, cs]) => ({ command, credit: average(cs), answers: cs.length }));
}

// ---- Exam technique, pace, calibration ------------------------------------------

/** Lowest-credit group, preferring groups with more than one answer when there's a tie. */
function weakest(groups: { key: string; credit: number; answers: number }[]) {
	return [...groups].sort((a, b) => a.credit - b.credit || b.answers - a.answers)[0]?.key ?? null;
}

export function examTechnique(answers: AnswerRow[]): ExamTechnique | null {
	const latest = answers.filter((a) => a.qtype === 'exam_skill' && reached(a)).slice(-EXAM_TECHNIQUE_LATEST);
	if (latest.length === 0) return null;
	const group = (key: (a: AnswerRow) => string) => {
		const m = new Map<string, number[]>();
		for (const a of latest) m.set(key(a), [...(m.get(key(a)) ?? []), credit(a)]);
		return [...m].map(([k, cs]) => ({ key: k, credit: average(cs), answers: cs.length, ...figureStatus(average(cs)) }));
	};
	const overall = average(latest.map(credit));
	const byFormat = group((a) => a.skill_format ?? 'unknown');
	const byCommand = group((a) => a.command);
	return {
		answers: latest.length,
		credit: overall,
		...figureStatus(overall),
		by_format: byFormat,
		by_command: byCommand,
		weakest_format: weakest(byFormat),
		weakest_command: weakest(byCommand)
	};
}

export function pace(history: History): Pace | null {
	const timed = history.attempts.filter((a) => a.mode === 'timed');
	if (timed.length === 0) return null;
	const counted = timed.filter((a) => !a.overtime && a.time_taken_s !== null);
	const perAttempt = counted.map((a) => {
		const rows = history.answers.filter((r) => r.attempt_id === a.id);
		const reachedRows = rows.filter(reached);
		const marks = reachedRows.reduce((s, r) => s + r.max_marks, 0);
		return {
			reached: rows.length ? reachedRows.length / rows.length : 0,
			secondsPerMark: marks > 0 ? a.time_taken_s! / marks : null
		};
	});
	const spm = perAttempt.map((p) => p.secondsPerMark).filter((x): x is number => x !== null);
	const latest = timed.at(-1)!;
	return {
		attempts: counted.length,
		reached: counted.length ? average(perAttempt.map((p) => p.reached)) : null,
		seconds_per_mark: spm.length ? average(spm) : null,
		target_seconds_per_mark: SECONDS_PER_MARK,
		latest_score: latest.max_score > 0 ? latest.score / latest.max_score : 0
	};
}

/** Pace figures for one timed attempt, for its feedback screen. */
export function attemptPace(
	rows: { not_reached: boolean; max_marks: number }[],
	timeTakenS: number,
	limitS: number
) {
	const reachedRows = rows.filter((r) => !r.not_reached);
	const marks = reachedRows.reduce((s, r) => s + r.max_marks, 0);
	return {
		reached: reachedRows.length,
		total: rows.length,
		time_taken_s: timeTakenS,
		time_limit_s: limitS,
		overtime: timeTakenS > limitS + OVERTIME_GRACE_S,
		seconds_per_question: reachedRows.length ? timeTakenS / reachedRows.length : null,
		target_seconds_per_question: rows.length ? (rows.reduce((s, r) => s + r.max_marks, 0) * SECONDS_PER_MARK) / rows.length : null,
		seconds_per_mark: marks ? timeTakenS / marks : null,
		target_seconds_per_mark: SECONDS_PER_MARK
	};
}

export function calibration(answers: AnswerRow[]): Calibration {
	const rated = answers.filter((a) => reached(a) && a.confidence !== null);
	const sure = rated.filter((a) => a.confidence === 'sure');
	const guess = rated.filter((a) => a.confidence === 'guess');
	const rate = (xs: AnswerRow[]) => (xs.length ? xs.filter((a) => a.correct).length / xs.length : null);
	const sureRight = rate(sure);
	const guessRight = rate(guess);
	if (rated.length < CALIBRATION_MIN_RATED) {
		return { shown: false, rated: rated.length, needed: CALIBRATION_MIN_RATED, messages: [] };
	}
	// More than one message can apply at once.
	const messages: string[] = [];
	if (sureRight !== null && sureRight >= CALIBRATION_SURE_GOOD) {
		messages.push("When you say you're sure, you're usually right — good self-awareness.");
	}
	if (sureRight !== null && sureRight < CALIBRATION_SURE_POOR) {
		messages.push("You're often sure about answers that turn out wrong. Slow down and check before choosing.");
	}
	if (guess.length >= CALIBRATION_GUESS_MIN && guessRight !== null && guessRight >= CALIBRATION_GUESS_GOOD) {
		messages.push("You know more than you think — when you guess, you're often right. Trust yourself a bit more.");
	}
	return {
		shown: true,
		rated: rated.length,
		needed: CALIBRATION_MIN_RATED,
		sure: { answers: sure.length, right: sureRight },
		guess: { answers: guess.length, right: guessRight },
		messages
	};
}

// ---- Mistakes ---------------------------------------------------------------------

/** "2026-10-19" for a moment, as a calendar day in TIME_ZONE. */
export function dayKey(iso: string, timeZone = TIME_ZONE): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

const isMistake = (a: AnswerRow) => !a.correct || !!a.dont_know || a.confidence === 'guess';

export interface Mistake {
	question_id: string;
	quiz_id: string;
	concept: string;
	/** When the most recent mistake was made. */
	at: string;
}

/**
 * Questions waiting in "Practise my mistakes", most recent mistake first.
 *
 * A question joins the list when it's answered wrongly, guessed, or "I don't
 * know". It leaves only when it's answered correctly with "Sure" on a LATER
 * DAY than the mistake: getting it right straight after seeing the answer
 * doesn't show it has stuck.
 */
export function mistakeList(answers: AnswerRow[], timeZone = TIME_ZONE): Mistake[] {
	const open = new Map<string, Mistake>();
	for (const a of answers) {
		if (!reached(a)) continue;
		if (isMistake(a)) {
			open.delete(a.question_id); // re-insert so the order follows the latest mistake
			open.set(a.question_id, { question_id: a.question_id, quiz_id: a.quiz_id, concept: a.concept, at: a.answered_at });
		} else {
			const m = open.get(a.question_id);
			if (m && dayKey(a.answered_at, timeZone) > dayKey(m.at, timeZone)) open.delete(a.question_id);
		}
	}
	return [...open.values()].reverse();
}

// ---- The progress page ---------------------------------------------------------

/** What to do next, in priority order: mistakes, a topic due for review, the weakest topic, a new topic. */
export function suggestNext(topics: TopicProgress[], mistakes: number): Suggestion | null {
	if (mistakes > 0) {
		return { kind: 'mistakes', text: `Practise your ${mistakes} mistake${mistakes === 1 ? '' : 's'}`, url: '/review/?mode=mistakes' };
	}
	const due = topics.find((t) => t.due_for_review);
	if (due) return { kind: 'review', text: `${due.title} is due for review`, url: due.page, quiz_id: due.quiz_id };
	const started = topics.filter((t) => t.status !== 'not_started' && t.status !== 'secure');
	const weakestTopic = [...started].sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0))[0];
	if (weakestTopic) {
		return { kind: 'weakest', text: `Work on ${weakestTopic.title}`, url: weakestTopic.page, quiz_id: weakestTopic.quiz_id };
	}
	const fresh = topics.find((t) => t.status === 'not_started');
	if (fresh) return { kind: 'new', text: `Try ${fresh.title}`, url: fresh.page, quiz_id: fresh.quiz_id };
	return null;
}

export function buildProgress(username: string, quizzes: QuizInfo[], history: History, now = Date.now()): ProgressData {
	const topics = quizzes.map((q) => topicProgress(q, history, now));
	const servable = new Set(quizzes.flatMap((q) => q.question_ids));
	const mistakes = mistakeList(history.answers).filter((m) => servable.has(m.question_id));
	const byQuiz = new Map<string, number>();
	for (const m of mistakes) byQuiz.set(m.quiz_id, (byQuiz.get(m.quiz_id) ?? 0) + 1);
	return {
		username,
		topics,
		suggested: suggestNext(topics, mistakes.length),
		mistakes: { total: mistakes.length, by_quiz: [...byQuiz].map(([quiz_id, count]) => ({ quiz_id, count })) },
		exam_technique: examTechnique(history.answers),
		pace: pace(history),
		calibration: calibration(history.answers)
	};
}
