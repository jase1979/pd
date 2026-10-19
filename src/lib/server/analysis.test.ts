import { describe, expect, it } from 'vitest';
import { groupSummary, heatmap, inactive, indexQuestions, markbook, overconfident, questionHealth, questionStats, studentProfile } from './analysis';
import type { ChoiceRow, GroupHistory, History } from './history';
import type { QuizInfo } from './progress';
import { multi, question, quiz, twoTier } from './quiz/fixtures';

const T0 = Date.UTC(2026, 9, 5, 9);
const HOUR = 3600_000;
const at = (h: number) => new Date(T0 + h * HOUR).toISOString();

/** One saved answer (with the option chosen) by a student. */
function row(student_id: number, question_id: string, chosen: unknown, extra: Partial<ChoiceRow> = {}): ChoiceRow {
	const right = extra.correct ?? (chosen === 0 ? 1 : 0);
	return {
		student_id,
		attempt_id: student_id * 1000,
		mode: 'topic',
		answered_at: at(0),
		question_id,
		quiz_id: 'test-quiz',
		spec_point: '2.1.2.2',
		concept: question_id,
		command: 'identify',
		qtype: 'single',
		skill_format: null,
		dont_know: chosen === null ? 1 : 0,
		not_reached: 0,
		confidence: chosen === null ? null : 'sure',
		marks: right,
		max_marks: 1,
		correct: right,
		chosen: chosen === null ? null : JSON.stringify(chosen),
		...extra
	};
}

/** A GroupHistory built from answer rows (and optional attempts/pages per student). */
function groupOf(rows: ChoiceRow[], students = [...new Set(rows.map((r) => r.student_id))], extra: Record<number, Partial<History>> = {}): GroupHistory {
	const histories = new Map<number, History>();
	for (const id of students) {
		histories.set(id, {
			answers: rows.filter((r) => r.student_id === id).map(({ student_id: _s, chosen: _c, ...a }) => a),
			attempts: [],
			pages: [],
			...extra[id]
		});
	}
	return {
		students: students.map((id) => ({ id, username: `s${id}`, group_id: 1, last_active_at: null })),
		histories,
		choices: rows
	};
}

const bank = quiz(3); // q-1..q-3, option 0 right, options 1 and 2 wrong
const index = indexQuestions([bank]);
const info: QuizInfo = { id: 'test-quiz', title: 'Test topic', unit: '2.1.2', page: '/gcse/unit2/timber/', concepts: 3, question_ids: ['q-1', 'q-2', 'q-3'] };

describe('questionStats', () => {
	it('gives correct, "I don\'t know" and confidently-wrong rates, and the most common wrong answer with its why_wrong', () => {
		const rows = [
			row(1, 'q-1', 0),
			row(2, 'q-1', 1),
			row(3, 'q-1', 1, { confidence: 'guess' }),
			row(4, 'q-1', 2),
			row(5, 'q-1', null),
			row(6, 'q-1', 0, { not_reached: 1, mode: 'timed' }) // not counted
		];
		const [s] = questionStats(rows, index);
		expect(s).toMatchObject({
			question_id: 'q-1',
			answers: 5,
			correct_rate: 0.2,
			dont_know_rate: 0.2,
			confidently_wrong_rate: 0.4, // students 2 and 4
			most_common_wrong: { text: 'Wrong A', why_wrong: 'Because A.', rate: 0.4 }
		});
	});

	it('sorts by confidently-wrong rate, highest first', () => {
		const rows = [row(1, 'q-1', 0), row(1, 'q-2', 1), row(2, 'q-2', 1)];
		expect(questionStats(rows, index).map((s) => s.question_id)).toEqual(['q-2', 'q-1']);
	});

	it('counts options in multi and two-tier answers', () => {
		const q = quiz(0);
		q.questions = [multi('m-1', 'm'), twoTier('t-1', 't')];
		const idx = indexQuestions([q]);
		const rows = [
			row(1, 'm-1', [0, 2], { qtype: 'multi', correct: 0 }),
			row(2, 'm-1', [0, 1], { qtype: 'multi', correct: 1 }),
			row(1, 't-1', { answer: 0, reason: 1 }, { qtype: 'two_tier', correct: 0 })
		];
		const stats = questionStats(rows, idx);
		const m = stats.find((s) => s.question_id === 'm-1')!;
		expect(m.options.map((o) => o.rate)).toEqual([1, 0.5, 0.5, 0]);
		const t = stats.find((s) => s.question_id === 't-1')!;
		expect(t.options.filter((o) => o.tier === 'reason').map((o) => o.rate)).toEqual([0, 1]);
		expect(t.most_common_wrong).toMatchObject({ text: 'Bad reason', why_wrong: 'Not a reason.' });
	});
});

describe('questionHealth', () => {
	/** 30 students; a student's ability decides whether they get "q-*" right, unless `pattern` says otherwise. */
	function cohort(pattern: (student: number) => unknown, qid = 'q-1') {
		const rows: ChoiceRow[] = [];
		for (let s = 1; s <= 30; s++) {
			// Students 21-30 strong, 1-10 weak: their answers to q-2 and q-3 set their overall mastery.
			const strong = s > 20;
			const weak = s <= 10;
			rows.push(row(s, 'q-2', strong ? 0 : weak ? 1 : s % 2 ? 0 : 1));
			rows.push(row(s, 'q-3', strong ? 0 : weak ? 2 : s % 2 ? 1 : 0));
			rows.push(row(s, qid, pattern(s)));
		}
		return groupOf(rows);
	}
	const flagsFor = (g: GroupHistory, qid = 'q-1') => questionHealth(g, index).find((h) => h.question_id === qid)?.flags.map((f) => f.kind) ?? [];

	it("doesn't judge a question with fewer than 30 answers", () => {
		const g = groupOf(Array.from({ length: 29 }, (_, i) => row(i + 1, 'q-1', 0)));
		expect(questionHealth(g, index)).toEqual([]);
	});

	it('flags a wrong option chosen in under 5% of answers', () => {
		// Option 2 is never chosen; option 1 often is.
		const g = cohort((s) => (s > 15 ? 0 : 1));
		const h = questionHealth(g, index).find((x) => x.question_id === 'q-1')!;
		expect(h.flags).toContainEqual({ kind: 'option_not_working', text: '"Wrong B" chosen in 0% of answers' });
		expect(h.flags.find((f) => f.text.includes('Wrong A'))).toBeUndefined();
	});

	it('flags a question more than 90% of students get right', () => {
		expect(flagsFor(cohort((s) => (s === 1 ? 1 : s === 2 ? 2 : 0)))).toContain('too_easy'); // 28/30
		expect(flagsFor(cohort((s) => (s <= 3 ? 1 + (s % 2) : 0)))).not.toContain('too_easy'); // 27/30 = 90%
	});

	it('flags poor discrimination: the strongest third do no better than the weakest', () => {
		// Right for odd-numbered students, whatever their ability.
		expect(flagsFor(cohort((s) => (s % 2 ? 0 : 1 + (s % 4 === 0 ? 1 : 0))))).toContain('poor_discrimination');
		// Right for the strong, wrong for the weak: discriminates well.
		expect(flagsFor(cohort((s) => (s > 15 ? 0 : 1 + (s % 2))))).not.toContain('poor_discrimination');
	});

	it('flags a high "I don\'t know" rate', () => {
		expect(flagsFor(cohort((s) => (s <= 13 ? null : s % 3 ? 0 : 1 + (s % 2))))).toContain('high_dont_know'); // 13/30 = 43%
		expect(flagsFor(cohort((s) => (s <= 12 ? null : s % 3 ? 0 : 1 + (s % 2))))).not.toContain('high_dont_know'); // 40%
	});

	it('says which file to edit', () => {
		const [h] = questionHealth(cohort((s) => (s > 15 ? 0 : 1)), index);
		expect(h.file).toBe('content/quizzes/test-quiz.yml');
	});
});

describe('per student', () => {
	it('flags a topic as overconfident: 5+ "Sure" answers, 30%+ of them wrong', () => {
		const h = (wrong: number, total = 6): History => ({
			answers: Array.from({ length: total }, (_, i) => {
				const { student_id: _s, chosen: _c, ...a } = row(1, `q-${i}`, i < wrong ? 1 : 0);
				return a;
			}),
			attempts: [],
			pages: []
		});
		expect(overconfident(h(2), 'test-quiz')).toBe(true); // 2/6 = 33%
		expect(overconfident(h(1), 'test-quiz')).toBe(false);
		expect(overconfident(h(4, 4), 'test-quiz')).toBe(false); // only 4 "Sure" answers
	});

	it('counts a student as inactive after 14 days without attempts or notes views', () => {
		const attempt = (h: number) => ({ id: 1, mode: 'topic' as const, quiz_id: 'x', score: 1, max_score: 1, question_count: 1, time_limit_s: null, time_taken_s: 1, overtime: 0, started_at: at(h), completed_at: at(h) });
		const now = T0 + 20 * 24 * HOUR;
		expect(inactive({ answers: [], attempts: [], pages: [] }, now)).toBe(true);
		expect(inactive({ answers: [], attempts: [attempt(0)], pages: [] }, now)).toBe(true);
		expect(inactive({ answers: [], attempts: [attempt(10 * 24)], pages: [] }, now)).toBe(false);
		expect(inactive({ answers: [], attempts: [], pages: [{ page_path: '/gcse/', first_viewed: at(0), last_viewed: at(10 * 24), view_count: 2 }] }, now)).toBe(false);
	});

	it('builds a profile with topics, mistakes and attempt history (newest first)', () => {
		const g = groupOf([row(1, 'q-1', 1), row(1, 'q-2', 0)], [1], {
			1: {
				attempts: [
					{ id: 1, mode: 'topic', quiz_id: 'test-quiz', score: 1, max_score: 2, question_count: 2, time_limit_s: null, time_taken_s: 60, overtime: 0, started_at: at(0), completed_at: at(0) },
					{ id: 2, mode: 'mixed', quiz_id: null, score: 0, max_score: 0, question_count: 0, time_limit_s: null, time_taken_s: 5, overtime: 0, started_at: at(5), completed_at: at(5) }
				]
			}
		});
		const p = studentProfile(g.students[0], g.histories.get(1)!, [info]);
		expect(p.topics[0]).toMatchObject({ quiz_id: 'test-quiz', starting_point: 0.5, mastery: 0.5 });
		expect(p.mistakes).toBe(1);
		expect(p.attempts.map((a) => a.mode)).toEqual(['mixed', 'topic']);
	});
});

describe('group views', () => {
	const g = groupOf([
		row(1, 'q-1', 0, { spec_point: 'A', command: 'state' }),
		row(1, 'q-2', 1, { spec_point: 'B', command: 'identify' }),
		row(2, 'q-1', 1, { spec_point: 'A', command: 'state' })
	], [1, 2, 3]);

	it('builds a students × topics heatmap with text labels', () => {
		const h = heatmap('topic', g, [info]);
		expect(h.columns).toEqual([{ key: 'test-quiz', label: 'Test topic' }]);
		expect(h.rows.map((r) => r.cells[0].label)).toEqual(['Getting there', 'Not secure yet', 'Not started']);
	});

	it('switches to spec points and command words', () => {
		const bySpec = heatmap('spec_point', g, [info]);
		expect(bySpec.columns.map((c) => c.key)).toEqual(['A', 'B']);
		expect(bySpec.rows[0].cells.map((c) => c.value)).toEqual([1, 0]);
		expect(bySpec.rows[2].cells.map((c) => c.status)).toEqual(['not_started', 'not_started']);
		expect(heatmap('command', g, [info]).columns.map((c) => c.key)).toEqual(['identify', 'state']);
	});

	it('summarises the weakest spec points and the command-word profile', () => {
		const s = groupSummary(g, [info]);
		expect(s.weakest_spec_points[0]).toEqual({ spec_point: 'B', mastery: 0, students: 1 });
		expect(s.command_profile).toEqual([
			{ command: 'identify', credit: 0, students: 1 },
			{ command: 'state', credit: 0.5, students: 2 }
		]);
		expect(s.inactive.map((x) => x.username)).toEqual(['s1', 's2', 's3']);
	});

	it('exports a markbook row per student', () => {
		const rows = markbook(g, [info]);
		expect(rows[0]).toEqual(['username', 'last active', 'Test topic: status', 'Test topic: mastery %', 'Test topic: starting point %', 'Test topic: latest %', 'exam technique %', 'mistakes waiting', 'topics attempted']);
		expect(rows[1].slice(0, 4)).toEqual(['s1', '', 'Getting there', '50']);
		expect(rows[3].slice(-1)).toEqual(['0 of 1']);
	});
});
