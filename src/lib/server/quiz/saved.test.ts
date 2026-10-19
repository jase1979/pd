// Logged-in attempts, saved to a real (SQLite) database: saving, the
// single-submit rule, cooldowns, least-recently-seen selection, mistakes,
// and every multi-topic mode.

import { describe, expect, it } from 'vitest';
import { startAttempt, submitAttempt, type AttemptContext } from './attempts';
import { topicWeight } from './modes';
import { drawWeighted } from './select';
import { bestAnswer, question, quiz, seeded } from './fixtures';
import { seedStudents, testDb } from '../testing/d1';
import { loadHistory, trackPage } from '../history';
import { SECONDS_PER_MARK } from '../config';
import type { Quiz } from './types';
import type { StartResult } from '$lib/quiz/public';

const secret = 'test-secret';
const T0 = Date.UTC(2026, 9, 5, 9);
const HOUR = 3600_000;

/** A quiz with `n` single questions on `n` concepts. */
const topicQuiz = (id: string, n = 10, perAttempt = 5): Quiz => {
	const q = quiz(n, { id, questions_per_attempt: perAttempt, exam_skills_per_attempt: 0 });
	q.questions = q.questions.map((x, i) => ({ ...x, id: `${id}-${i + 1}`, concept: `${id}-c${i + 1}` }));
	return q;
};

async function setup(quizzes: Quiz[], cooldownHours = 0) {
	const db = testDb();
	const [amy, ben] = await seedStudents(db, ['amy', 'ben'], cooldownHours);
	const student = (id: number, username: string) => ({ id, username, group_id: 1 });
	const as = (who: 'amy' | 'ben', now: number, extra: Partial<AttemptContext> = {}): AttemptContext => ({
		quizzes,
		environment: 'production',
		secret,
		db,
		student: who === 'amy' ? student(amy, 'amy') : student(ben, 'ben'),
		random: seeded(now % 997),
		now,
		...extra
	});
	return { db, amy, as };
}

/** Answer every question: option 0 (correct in the fixtures) unless `wrong` says otherwise. */
function answers(start: StartResult, { wrong = [] as string[], confidence = 'sure' as 'sure' | 'guess' } = {}) {
	return start.questions.map((q) => ({
		question_id: q.id,
		chosen: wrong.includes(q.id) ? 1 : 0,
		dont_know: false,
		confidence
	}));
}

describe('saved attempts', () => {
	it('stores the attempt and its answers for a logged-in student', async () => {
		const timber = topicQuiz('timber');
		const { db, as } = await setup([timber]);
		const start = await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0));
		expect(start).toMatchObject({ mode: 'topic', saving_as: 'amy' });
		expect(start.token).toBeUndefined();

		const res = await submitAttempt({ attempt_id: start.attempt_id, answers: answers(start, { wrong: [start.questions[0].id] }) }, as('amy', T0 + 60_000));
		expect(res).toMatchObject({ saved: true, score: 4, max_score: 5 });

		const attempt = await db.prepare('SELECT * FROM attempts').first<Record<string, unknown>>();
		expect(attempt).toMatchObject({ mode: 'topic', quiz_id: 'timber', score: 4, max_score: 5, time_taken_s: 60 });
		const { results } = await db.prepare('SELECT * FROM attempt_answers ORDER BY rowid').all<Record<string, unknown>>();
		expect(results).toHaveLength(5);
		expect(results[0]).toMatchObject({ quiz_id: 'timber', concept: expect.any(String), qtype: 'single', chosen: '1', correct: 0, confidence: 'sure' });
	});

	it('can only be submitted once', async () => {
		const { db, as } = await setup([topicQuiz('timber')]);
		const start = await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0));
		const body = { attempt_id: start.attempt_id, answers: answers(start) };
		await submitAttempt(body, as('amy', T0 + 1000));
		await expect(submitAttempt(body, as('amy', T0 + 2000))).rejects.toMatchObject({ status: 409 });
		expect((await db.prepare('SELECT COUNT(*) AS n FROM attempt_answers').first<{ n: number }>())!.n).toBe(5);
	});

	it("can't be submitted by another student", async () => {
		const { as } = await setup([topicQuiz('timber')]);
		const start = await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0));
		await expect(submitAttempt({ attempt_id: start.attempt_id, answers: answers(start) }, as('ben', T0))).rejects.toMatchObject({ status: 404 });
	});

	it('ignores unfinished attempts in the history', async () => {
		const { db, amy, as } = await setup([topicQuiz('timber')]);
		await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0)); // never submitted
		const history = await loadHistory(db, amy);
		expect(history.attempts).toEqual([]);
		expect(history.answers).toEqual([]);
	});
});

describe('the retry cooldown', () => {
	it('is measured from the last COMPLETED attempt, and only applies to topic quizzes', async () => {
		const timber = topicQuiz('timber');
		const { as } = await setup([timber], 24);
		// An unfinished attempt doesn't start the cooldown.
		await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0));
		const start = await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0 + 1000));
		await submitAttempt({ attempt_id: start.attempt_id, answers: answers(start, { wrong: [start.questions[0].id] }) }, as('amy', T0 + 2000));

		await expect(startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0 + 23 * HOUR))).rejects.toMatchObject({
			status: 429,
			message: expect.stringMatching(/spacing it out helps it stick/)
		});
		// Other modes aren't affected.
		await expect(startAttempt({ mode: 'mixed', topics: ['timber'] }, as('amy', T0 + HOUR))).resolves.toBeDefined();
		await expect(startAttempt({ mode: 'mistakes' }, as('amy', T0 + HOUR))).resolves.toBeDefined();
		// Nor is another student.
		await expect(startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('ben', T0 + HOUR))).resolves.toBeDefined();
		// And it ends.
		await expect(startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0 + 24 * HOUR + 3000))).resolves.toBeDefined();
	});
});

describe('least-recently-seen selection', () => {
	it('serves questions never answered before ones already answered', async () => {
		const { as } = await setup([topicQuiz('timber', 10, 5)]);
		const first = await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0));
		await submitAttempt({ attempt_id: first.attempt_id, answers: answers(first) }, as('amy', T0 + 1000));
		const second = await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0 + HOUR));
		const firstIds = first.questions.map((q) => q.id);
		expect(second.questions.map((q) => q.id).filter((id) => firstIds.includes(id))).toEqual([]);
	});

	it('then the ones seen longest ago', async () => {
		const { as } = await setup([topicQuiz('timber', 6, 5)]);
		const runs: string[][] = [];
		for (let i = 0; i < 3; i++) {
			const s = await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0 + i * HOUR));
			runs.push(s.questions.map((q) => q.id));
			await submitAttempt({ attempt_id: s.attempt_id, answers: answers(s) }, as('amy', T0 + i * HOUR + 1000));
		}
		// Run 2 includes the one question run 1 left out; run 3 includes the
		// oldest from run 1 rather than repeating all of run 2.
		const all = ['timber-1', 'timber-2', 'timber-3', 'timber-4', 'timber-5', 'timber-6'];
		const unseenAfterFirst = all.find((id) => !runs[0].includes(id))!;
		expect(runs[1]).toContain(unseenAfterFirst);
		const oldest = runs[0].find((id) => !runs[1].includes(id))!; // last seen in run 1
		expect(runs[2]).toContain(oldest);
	});

	it("doesn't count an unfinished attempt as seen", async () => {
		const { as } = await setup([topicQuiz('timber', 10, 5)]);
		const abandoned = await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0));
		const next = await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0 + 1000, { random: seeded(T0 % 997) }));
		// Same random seed and nothing seen: the same questions come up.
		expect(next.questions.map((q) => q.id).sort()).toEqual(abandoned.questions.map((q) => q.id).sort());
	});
});

describe('Practise my mistakes', () => {
	it('needs a login', async () => {
		const timber = topicQuiz('timber');
		await expect(startAttempt({ mode: 'mistakes' }, { quizzes: [timber], environment: 'production', secret })).rejects.toMatchObject({ status: 401 });
	});

	it('serves the questions answered wrongly or guessed, most recent first', async () => {
		const { as } = await setup([topicQuiz('timber', 10, 10)]);
		const s = await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0));
		const wrong = s.questions.slice(0, 3).map((q) => q.id);
		await submitAttempt({ attempt_id: s.attempt_id, answers: answers(s, { wrong }) }, as('amy', T0 + 1000));
		const m = await startAttempt({ mode: 'mistakes' }, as('amy', T0 + HOUR));
		expect(m.questions.map((q) => q.id).sort()).toEqual([...wrong].sort());
	});

	it('keeps a mistake fixed on the same day, and clears it on a later day', async () => {
		const { as } = await setup([topicQuiz('timber', 10, 10)]);
		const s = await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0));
		await submitAttempt({ attempt_id: s.attempt_id, answers: answers(s, { wrong: [s.questions[0].id] }) }, as('amy', T0 + 1000));

		const sameDay = await startAttempt({ mode: 'mistakes' }, as('amy', T0 + 2 * HOUR));
		await submitAttempt({ attempt_id: sameDay.attempt_id, answers: answers(sameDay) }, as('amy', T0 + 2 * HOUR + 1000));
		const later = await startAttempt({ mode: 'mistakes' }, as('amy', T0 + 25 * HOUR));
		expect(later.questions).toHaveLength(1);
		await submitAttempt({ attempt_id: later.attempt_id, answers: answers(later) }, as('amy', T0 + 25 * HOUR + 1000));
		await expect(startAttempt({ mode: 'mistakes' }, as('amy', T0 + 26 * HOUR))).rejects.toMatchObject({ status: 404 });
	});
});

describe('Mixed review', () => {
	it('draws only from topics a logged-in student has practised', async () => {
		const quizzes = [topicQuiz('timber'), topicQuiz('metals'), topicQuiz('polymers')];
		const { as } = await setup(quizzes);
		await expect(startAttempt({ mode: 'mixed' }, as('amy', T0))).rejects.toMatchObject({ status: 409 });
		for (const id of ['timber', 'metals']) {
			const s = await startAttempt({ mode: 'topic', quiz_id: id }, as('amy', T0));
			await submitAttempt({ attempt_id: s.attempt_id, answers: answers(s) }, as('amy', T0 + 1000));
		}
		const m = await startAttempt({ mode: 'mixed' }, as('amy', T0 + HOUR));
		expect(m.questions).toHaveLength(10);
		expect(m.questions.every((q) => !q.id.startsWith('polymers'))).toBe(true);
		expect(new Set(m.questions.map((q) => q.id)).size).toBe(10);
	});

	it('lets an anonymous user tick the topics', async () => {
		const quizzes = [topicQuiz('timber'), topicQuiz('metals')];
		const c = { quizzes, environment: 'production', secret, random: seeded(), now: T0 };
		await expect(startAttempt({ mode: 'mixed' }, c)).rejects.toMatchObject({ status: 400 });
		const m = await startAttempt({ mode: 'mixed', topics: ['metals'] }, c);
		expect(m.token).toBeDefined();
		expect(m.questions.every((q) => q.id.startsWith('metals'))).toBe(true);
	});

	it('avoids questions answered in the last 24 hours where it can', async () => {
		const { as } = await setup([topicQuiz('timber', 20, 10)]);
		const s = await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as('amy', T0));
		await submitAttempt({ attempt_id: s.attempt_id, answers: answers(s) }, as('amy', T0 + 1000));
		const m = await startAttempt({ mode: 'mixed' }, as('amy', T0 + HOUR));
		const recent = s.questions.map((q) => q.id);
		expect(m.questions.filter((q) => recent.includes(q.id))).toEqual([]);
	});

	it('weights weak and long-unpractised topics more heavily', () => {
		const now = T0;
		const ago = (days: number) => new Date(now - days * 24 * HOUR).toISOString();
		expect(topicWeight(1, ago(0), now)).toBe(0.1); // mastered today: the minimum
		expect(topicWeight(0.5, ago(14), now)).toBe(1); // 0.5 + 14/28
		expect(topicWeight(0, ago(100), now)).toBe(2); // capped recency
		expect(topicWeight(0.8, ago(7), now)).toBeCloseTo(0.45);
	});

	it('draws topics in proportion to their weights', () => {
		const many = (id: string) => Array.from({ length: 400 }, (_, i) => question(`${id}-${i}`, `${id}-${i}`));
		const counts = { a: 0, b: 0 };
		const picked = drawWeighted(
			[
				{ quiz_id: 'a', weight: 3, questions: many('a') },
				{ quiz_id: 'b', weight: 1, questions: many('b') }
			],
			400,
			{ random: seeded(7) }
		);
		for (const q of picked) counts[q.id[0] as 'a' | 'b']++;
		expect(counts.a / 400).toBeGreaterThan(0.68);
		expect(counts.a / 400).toBeLessThan(0.82);
	});
});

describe('Exam technique', () => {
	const withSkills = (n: number) => {
		const q = topicQuiz('timber');
		q.questions.push(...Array.from({ length: n }, (_, i) => bestAnswer(`skill-${i}`, `skill-c${i}`)));
		return q;
	};

	it('serves only exam_skill questions', async () => {
		const c = { quizzes: [withSkills(12)], environment: 'production', secret, random: seeded(), now: T0 };
		const s = await startAttempt({ mode: 'technique', topics: ['timber'] }, c);
		expect(s.questions).toHaveLength(10);
		expect(s.questions.every((q) => q.type === 'exam_skill')).toBe(true);
	});

	it('needs at least 5 to start', async () => {
		const c = { quizzes: [withSkills(4)], environment: 'production', secret, now: T0 };
		await expect(startAttempt({ mode: 'technique', topics: ['timber'] }, c)).rejects.toMatchObject({ status: 409 });
	});
});

describe('Timed practice', () => {
	const big = () => {
		const q = topicQuiz('timber', 25, 10);
		q.questions.push(...Array.from({ length: 6 }, (_, i) => bestAnswer(`skill-${i}`, `skill-c${i}`)));
		return q;
	};

	it('serves 20 questions with up to 4 exam_skill ones last, and a limit of marks × 45 seconds', async () => {
		const c = { quizzes: [big()], environment: 'production', secret, random: seeded(), now: T0 };
		const s = await startAttempt({ mode: 'timed', topics: ['timber'] }, c);
		expect(s.questions).toHaveLength(20);
		expect(s.questions.slice(16).every((q) => q.type === 'exam_skill')).toBe(true);
		expect(s.questions.slice(0, 16).every((q) => q.type !== 'exam_skill')).toBe(true);
		expect(s.time_limit_s).toBe(20 * SECONDS_PER_MARK); // all 1-mark questions
	});

	it('records "not reached" questions, makes confidence optional, and gives pace', async () => {
		const { db, as } = await setup([big()]);
		const s = await startAttempt({ mode: 'timed', topics: ['timber'] }, as('amy', T0));
		const sent = s.questions.map((q, i) =>
			i >= 15 ? { question_id: q.id, not_reached: true } : { question_id: q.id, chosen: 0, dont_know: false, confidence: null }
		);
		const res = await submitAttempt({ attempt_id: s.attempt_id, answers: sent }, as('amy', T0 + 600_000));
		expect(res.pace).toMatchObject({ reached: 15, total: 20, time_taken_s: 600, time_limit_s: 900, overtime: false, seconds_per_question: 40 });
		expect(res.score).toBe(15);
		const nr = await db.prepare('SELECT COUNT(*) AS n FROM attempt_answers WHERE not_reached = 1').first<{ n: number }>();
		expect(nr!.n).toBe(5);
	});

	it('flags an attempt submitted more than 30 seconds after the limit as overtime, but still counts it', async () => {
		const { db, as } = await setup([big()]);
		const s = await startAttempt({ mode: 'timed', topics: ['timber'] }, as('amy', T0));
		// Every answer right (the exam_skill fixtures' best answer is option 2).
		const sent = s.questions.map((q) => ({ question_id: q.id, chosen: q.type === 'exam_skill' ? 2 : 0, dont_know: false, confidence: 'sure' }));
		const res = await submitAttempt({ attempt_id: s.attempt_id, answers: sent }, as('amy', T0 + (900 + 31) * 1000));
		expect(res.pace!.overtime).toBe(true);
		expect(res.score).toBe(20);
		expect((await db.prepare('SELECT overtime FROM attempts').first<{ overtime: number }>())!.overtime).toBe(1);
	});

	it('keeps the start time in the token for anonymous users', async () => {
		const c = { quizzes: [big()], environment: 'production', secret, random: seeded(), now: T0 };
		const s = await startAttempt({ mode: 'timed', topics: ['timber'] }, c);
		const sent = s.questions.map((q) => ({ question_id: q.id, chosen: 0, dont_know: false, confidence: null }));
		const res = await submitAttempt({ token: s.token, answers: sent }, { ...c, now: T0 + 2000 * 1000 });
		expect(res.pace).toMatchObject({ time_taken_s: 2000, overtime: true });
		expect(res.saved).toBe(false);
	});

	it('only allows "not reached" in timed practice', async () => {
		const c = { quizzes: [topicQuiz('timber')], environment: 'production', secret, random: seeded(), now: T0 };
		const s = await startAttempt({ mode: 'topic', quiz_id: 'timber' }, c);
		const sent = s.questions.map((q) => ({ question_id: q.id, not_reached: true }));
		await expect(submitAttempt({ token: s.token, answers: sent }, c)).rejects.toMatchObject({ status: 400 });
	});
});

describe('page activity', () => {
	it('records first view, last view and a count', async () => {
		const { db, amy } = await setup([]);
		await trackPage(db, amy, '/gcse/unit2/timber/', T0);
		await trackPage(db, amy, '/gcse/unit2/timber/', T0 + HOUR);
		const { pages } = await loadHistory(db, amy);
		expect(pages).toEqual([
			{ page_path: '/gcse/unit2/timber/', first_viewed: new Date(T0).toISOString(), last_viewed: new Date(T0 + HOUR).toISOString(), view_count: 2 }
		]);
	});
});
