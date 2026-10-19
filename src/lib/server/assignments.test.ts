import { describe, expect, it } from 'vitest';
import { createAssignment, deleteAssignment, groupAssignments, studentAssignments, workStatus } from './assignments';
import { addStudents, createGroup, groupFor, groupStudents, groupTeachers, listGroups, shareGroup, unshareGroup } from './groups';
import { teacherByEmail } from './teachers';
import { startAttempt, submitAttempt, type AttemptContext } from './quiz/attempts';
import { quiz, seeded } from './quiz/fixtures';
import { testDb } from './testing/d1';
import type { Quiz } from './quiz/types';

// Mon 19 Oct 2026, 10:00 in London.
const NOW = Date.UTC(2026, 9, 19, 9);
const HOUR = 3600_000;

/** A quiz with 12 single questions on 12 concepts, split over two spec points. */
function topicQuiz(id: string): Quiz {
	const q = quiz(12, { id, topic: `${id} topic`, questions_per_attempt: 10, exam_skills_per_attempt: 0 });
	q.questions = q.questions.map((x, i) => ({ ...x, id: `${id}-${i + 1}`, concept: `${id}-c${i + 1}`, spec_point: i < 6 ? 'A' : 'B' }));
	return q;
}

async function setup() {
	const db = testDb();
	const quizzes = [topicQuiz('timber'), topicQuiz('metals')];
	const jones = await teacherByEmail(db, 'jones@school.org');
	const group = await createGroup(db, jones, { name: '10X' }, NOW);
	await addStudents(db, jones, group.id, ['amy', 'ben'], NOW);
	const [amy, ben] = (await groupStudents(db, group.id)).map((s) => ({ id: s.id, username: s.username, group_id: group.id }));
	const topics = quizzes.map((q) => ({ id: q.id, title: q.topic }));
	const set = (body: Record<string, unknown>, weak: string[] = ['B']) =>
		createAssignment(db, jones, group.id, { due_date: '2026-10-23', ...body }, { topics, weakestSpecPoints: async () => weak, now: NOW });
	const as = (student: typeof amy, now = NOW): AttemptContext => ({ quizzes, environment: 'production', secret: 's', db, student, random: seeded(now % 991), now });
	const finish = async (student: typeof amy, start: Awaited<ReturnType<typeof startAttempt>>, now = NOW + HOUR) =>
		submitAttempt(
			{ attempt_id: start.attempt_id, answers: start.questions.map((q) => ({ question_id: q.id, chosen: 0, dont_know: false, confidence: 'sure' })) },
			as(student, now)
		);
	return { db, jones, group, amy, ben, set, as, finish, quizzes };
}

describe('setting work', () => {
	it('sets a topic quiz, a mixed quiz or a weakest-spec-points review, with sensible titles', async () => {
		const { set } = await setup();
		expect(await set({ kind: 'topic', quiz_id: 'timber' })).toMatchObject({ kind: 'topic', quiz_id: 'timber', title: 'timber topic quiz', assessment: false });
		expect(await set({ kind: 'mixed', topics: ['timber', 'metals', 'nope'] })).toMatchObject({ topics: ['timber', 'metals'], title: 'Mixed review: timber topic, metals topic' });
		expect(await set({ kind: 'weak_spec_points', assessment: true })).toMatchObject({ spec_points: ['B'], title: 'Review: spec points B', assessment: true });
	});

	it.each([
		[{ kind: 'topic', quiz_id: 'nope' }, /Choose a topic/],
		[{ kind: 'mixed', topics: [] }, /at least one topic/],
		[{ kind: 'essay' }, /what kind/],
		[{ kind: 'topic', quiz_id: 'timber', due_date: 'tomorrow' }, /due date/],
		[{ kind: 'topic', quiz_id: 'timber', due_date: '2026-10-18' }, /in the past/]
	])('rejects %j', async (body, pattern) => {
		const { set } = await setup();
		await expect(set(body)).rejects.toMatchObject({ message: expect.stringMatching(pattern) });
	});

	it("can't review weak spec points before there are any answers", async () => {
		const { set } = await setup();
		await expect(set({ kind: 'weak_spec_points' }, [])).rejects.toMatchObject({ status: 409 });
	});

	it("only lets teachers who can see the group set or delete work", async () => {
		const { db, group, set } = await setup();
		const patel = await teacherByEmail(db, 'patel@school.org');
		await expect(createAssignment(db, patel, group.id, { kind: 'topic', quiz_id: 'timber', due_date: '2026-10-23' }, { topics: [], weakestSpecPoints: async () => [], now: NOW })).rejects.toMatchObject({ status: 404 });
		const a = await set({ kind: 'topic', quiz_id: 'timber' });
		await expect(deleteAssignment(db, patel, a.id)).rejects.toMatchObject({ status: 404 });
	});
});

describe('work status', () => {
	it('is To do, Overdue, Done or Done late, by UK calendar day', () => {
		const due = '2026-10-19';
		expect(workStatus(due, null, NOW)).toBe('to_do');
		expect(workStatus(due, null, Date.UTC(2026, 9, 19, 22, 59))).toBe('to_do'); // 23:59 BST... still the 19th
		expect(workStatus(due, null, Date.UTC(2026, 9, 20, 9))).toBe('overdue');
		expect(workStatus(due, '2026-10-19T20:00:00.000Z', NOW)).toBe('done');
		expect(workStatus(due, '2026-10-20T08:00:00.000Z', NOW)).toBe('late');
	});

	it("shows the teacher every student's status and best score", async () => {
		const { amy, set, as, finish, jones, db, group } = await setup();
		const a = await set({ kind: 'topic', quiz_id: 'timber' });
		await finish(amy, await startAttempt({ mode: 'topic', assignment_id: a.id }, as(amy)));
		const [work] = await groupAssignments(db, jones, group.id, NOW + 2 * HOUR);
		expect(work.done).toBe(1);
		expect(work.students).toEqual([
			{ id: amy.id, username: 'amy', status: 'done', label: 'Done', best: 1, attempts: 1 },
			{ id: expect.any(Number), username: 'ben', status: 'to_do', label: 'To do', best: null, attempts: 0 }
		]);
		const [later] = await groupAssignments(db, jones, group.id, Date.UTC(2026, 9, 24, 9));
		expect(later.students[1].status).toBe('overdue');
	});

	it("lists a student's work: what's left first, soonest due first", async () => {
		const { amy, set, as, finish, db } = await setup();
		const done = await set({ kind: 'topic', quiz_id: 'timber', due_date: '2026-10-20' });
		await set({ kind: 'topic', quiz_id: 'metals', due_date: '2026-10-30' });
		await set({ kind: 'mixed', topics: ['metals'], due_date: '2026-10-21' });
		await finish(amy, await startAttempt({ mode: 'topic', assignment_id: done.id }, as(amy)));
		const list = await studentAssignments(db, amy, NOW + 2 * HOUR);
		expect(list.map((a) => [a.title, a.label])).toEqual([
			['Mixed review: metals topic', 'To do'],
			['metals topic quiz', 'To do'],
			['timber topic quiz', 'Done']
		]);
	});
});

describe('doing set work', () => {
	it('records which work an attempt was for, and ignores the group cooldown', async () => {
		const { db, amy, set, as, finish, jones, group } = await setup();
		await db.prepare('UPDATE teaching_groups SET retry_cooldown_hours = 48 WHERE id = ?').bind(group.id).run();
		await finish(amy, await startAttempt({ mode: 'topic', quiz_id: 'timber' }, as(amy)));
		const a = await set({ kind: 'topic', quiz_id: 'timber' });
		const s = await startAttempt({ mode: 'topic', assignment_id: a.id }, as(amy, NOW + 2 * HOUR));
		expect(s.assignment).toMatchObject({ id: a.id, assessment: false });
		await finish(amy, s, NOW + 3 * HOUR);
		const row = await db.prepare('SELECT assignment_id FROM attempts WHERE id = ?').bind(s.attempt_id).first<{ assignment_id: number }>();
		expect(row!.assignment_id).toBe(a.id);
		expect((await groupFor(db, jones, group.id)).retry_cooldown_hours).toBe(48);
	});

	it('can be retried, unless it is an assessment', async () => {
		const { amy, set, as, finish } = await setup();
		const practice = await set({ kind: 'topic', quiz_id: 'timber' });
		await finish(amy, await startAttempt({ mode: 'topic', assignment_id: practice.id }, as(amy)));
		await expect(startAttempt({ mode: 'topic', assignment_id: practice.id }, as(amy))).resolves.toBeDefined();

		const test = await set({ kind: 'topic', quiz_id: 'timber', assessment: true });
		const first = await startAttempt({ mode: 'topic', assignment_id: test.id }, as(amy));
		const result = await finish(amy, first);
		expect(result.assessment).toBe(true);
		await expect(startAttempt({ mode: 'topic', assignment_id: test.id }, as(amy))).rejects.toMatchObject({ status: 409 });
	});

	it('resumes an unfinished assessment with the same questions', async () => {
		const { amy, set, as } = await setup();
		const test = await set({ kind: 'mixed', topics: ['timber', 'metals'], assessment: true });
		const first = await startAttempt({ mode: 'mixed', assignment_id: test.id }, as(amy, NOW));
		const again = await startAttempt({ mode: 'mixed', assignment_id: test.id }, as(amy, NOW + 1000));
		expect(again.attempt_id).toBe(first.attempt_id);
		expect(again.questions.map((q) => q.id)).toEqual(first.questions.map((q) => q.id));
	});

	it('draws a weak-spec-points review only from those spec points', async () => {
		const { amy, set, as } = await setup();
		const review = await set({ kind: 'weak_spec_points' }, ['B']);
		const s = await startAttempt({ mode: 'mixed', assignment_id: review.id }, as(amy));
		// Spec point B is questions 7–12 of each quiz.
		expect(s.questions.length).toBeGreaterThanOrEqual(5);
		expect(s.questions.every((q) => Number(q.id.split('-')[1]) > 6)).toBe(true);
	});

	it("can't be started by a student in another group, or anonymously", async () => {
		const { db, jones, set, as, quizzes } = await setup();
		const other = await createGroup(db, jones, { name: '11Y' }, NOW);
		await addStudents(db, jones, other.id, ['cal'], NOW);
		const [cal] = await groupStudents(db, other.id);
		const a = await set({ kind: 'topic', quiz_id: 'timber' });
		await expect(startAttempt({ mode: 'topic', assignment_id: a.id }, as({ id: cal.id, username: 'cal', group_id: other.id }))).rejects.toMatchObject({ status: 404 });
		await expect(startAttempt({ mode: 'topic', assignment_id: a.id }, { quizzes, environment: 'production', secret: 's' })).rejects.toMatchObject({ status: 401 });
	});

	it('keeps the answers when the work is deleted', async () => {
		const { db, jones, amy, set, as, finish } = await setup();
		const a = await set({ kind: 'topic', quiz_id: 'timber' });
		await finish(amy, await startAttempt({ mode: 'topic', assignment_id: a.id }, as(amy)));
		await deleteAssignment(db, jones, a.id);
		const row = await db.prepare('SELECT COUNT(*) AS n, MAX(assignment_id) AS link FROM attempts').first<{ n: number; link: number | null }>();
		expect(row).toEqual({ n: 1, link: null });
	});
});

describe('sharing groups', () => {
	it('lets another teacher see a shared group', async () => {
		const { db, jones, group } = await setup();
		await shareGroup(db, jones, group.id, 'patel@school.org', NOW);
		const patel = await teacherByEmail(db, 'patel@school.org');
		expect((await listGroups(db, patel)).map((g) => g.name)).toEqual(['10X']);
		expect((await groupTeachers(db, patel, group.id)).map((t) => [t.email, t.owner])).toEqual([
			['jones@school.org', true],
			['patel@school.org', false]
		]);
	});

	it('only lets the owner remove other teachers, and never the owner', async () => {
		const { db, jones, group } = await setup();
		await shareGroup(db, jones, group.id, 'patel@school.org', NOW);
		await shareGroup(db, jones, group.id, 'khan@school.org', NOW);
		const patel = await teacherByEmail(db, 'patel@school.org');
		const khan = await teacherByEmail(db, 'khan@school.org');
		await expect(unshareGroup(db, patel, group.id, khan.id)).rejects.toMatchObject({ status: 403 });
		await expect(unshareGroup(db, patel, group.id, jones.id)).rejects.toMatchObject({ status: 400 });
		await unshareGroup(db, jones, group.id, khan.id);
		await unshareGroup(db, patel, group.id, patel.id); // leaving is allowed
		expect(await listGroups(db, patel)).toEqual([]);
		expect((await groupTeachers(db, jones, group.id)).map((t) => t.email)).toEqual(['jones@school.org']);
	});

	it("can't share a group you can't see", async () => {
		const { db, group } = await setup();
		const stranger = await teacherByEmail(db, 'x@school.org');
		await expect(shareGroup(db, stranger, group.id, 'x@school.org', NOW)).rejects.toMatchObject({ status: 404 });
	});
});

