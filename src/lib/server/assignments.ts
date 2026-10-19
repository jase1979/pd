// Set work: a quiz a teacher sets a group, due by the end of a given day.
//
// Three kinds: one topic quiz, a mixed quiz on chosen topics, or a review of
// the group's weakest spec points (fixed when the work is set, so it doesn't
// shift as the class improves). An assessment allows each student one
// attempt with no "Try again now"; ordinary set work can be retried.
//
// Due dates are calendar days in TIME_ZONE. Work handed in after its due day
// still counts, and is shown as late.

import { dayKey } from './progress';
import { groupFor } from './groups';
import { QuizError } from './quiz/core';
import type { PlanRequest } from './quiz/modes';
import type { Student } from './students';
import type { Teacher } from './teachers';

export type AssignmentKind = 'topic' | 'mixed' | 'weak_spec_points';

export interface Assignment {
	id: number;
	group_id: number;
	title: string;
	kind: AssignmentKind;
	quiz_id: string | null;
	topics: string[] | null;
	spec_points: string[] | null;
	assessment: boolean;
	due_date: string;
	created_at: string;
}

interface AssignmentRow extends Omit<Assignment, 'topics' | 'spec_points' | 'assessment'> {
	topics: string | null;
	spec_points: string | null;
	assessment: number;
}

const COLUMNS = 'id, group_id, title, kind, quiz_id, topics, spec_points, assessment, due_date, created_at';

const fromRow = (r: AssignmentRow): Assignment => ({
	...r,
	topics: r.topics ? JSON.parse(r.topics) : null,
	spec_points: r.spec_points ? JSON.parse(r.spec_points) : null,
	assessment: r.assessment === 1
});

/** The quizzes a group can be set, by id and title. */
export type TopicChoices = { id: string; title: string }[];

export async function createAssignment(
	db: D1Database,
	teacher: Teacher,
	groupId: unknown,
	body: Record<string, unknown>,
	{ topics, weakestSpecPoints, now = Date.now() }: { topics: TopicChoices; weakestSpecPoints: () => Promise<string[]>; now?: number }
): Promise<Assignment> {
	const group = await groupFor(db, teacher, groupId);
	const kind = body.kind as AssignmentKind;
	const due = String(body.due_date ?? '');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due))) throw new QuizError(400, 'Choose a due date.');
	if (due < dayKey(new Date(now).toISOString())) throw new QuizError(400, "The due date can't be in the past.");
	const titleOf = (id: string) => topics.find((t) => t.id === id)?.title;

	let quizId: string | null = null;
	let chosen: string[] | null = null;
	let specPoints: string[] | null = null;
	let title: string;
	if (kind === 'topic') {
		quizId = typeof body.quiz_id === 'string' && titleOf(body.quiz_id) ? body.quiz_id : null;
		if (!quizId) throw new QuizError(400, 'Choose a topic.');
		title = `${titleOf(quizId)} quiz`;
	} else if (kind === 'mixed') {
		chosen = Array.isArray(body.topics) ? body.topics.filter((t): t is string => typeof t === 'string' && !!titleOf(t)) : [];
		if (chosen.length === 0) throw new QuizError(400, 'Choose at least one topic.');
		title = `Mixed review: ${chosen.map(titleOf).join(', ')}`;
	} else if (kind === 'weak_spec_points') {
		specPoints = await weakestSpecPoints();
		if (specPoints.length === 0) throw new QuizError(409, "There aren't any answers yet to find this group's weakest spec points.");
		title = `Review: spec points ${specPoints.join(', ')}`;
	} else {
		throw new QuizError(400, 'Choose what kind of work to set.');
	}
	if (typeof body.title === 'string' && body.title.trim()) title = body.title.trim().slice(0, 100);

	const row = await db
		.prepare(
			`INSERT INTO assignments (group_id, created_by, title, kind, quiz_id, topics, spec_points, assessment, due_date, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`
		)
		.bind(
			group.id,
			teacher.id,
			title,
			kind,
			quizId,
			chosen && JSON.stringify(chosen),
			specPoints && JSON.stringify(specPoints),
			body.assessment === true ? 1 : 0,
			due,
			new Date(now).toISOString()
		)
		.first<AssignmentRow>();
	return fromRow(row!);
}

export async function deleteAssignment(db: D1Database, teacher: Teacher, assignmentId: unknown) {
	const row = await db.prepare('SELECT group_id FROM assignments WHERE id = ?').bind(Number(assignmentId)).first<{ group_id: number }>();
	if (!row) throw new QuizError(404, 'Not found.');
	await groupFor(db, teacher, row.group_id); // 404 unless the teacher can see the group
	// Attempts keep their answers; they just stop being linked to the work (ON DELETE SET NULL).
	await db.prepare('DELETE FROM assignments WHERE id = ?').bind(Number(assignmentId)).run();
}

// ---- Who has done what ---------------------------------------------------------------

export type WorkStatus = 'done' | 'late' | 'overdue' | 'to_do';

export const WORK_LABELS: Record<WorkStatus, string> = {
	done: 'Done',
	late: 'Done late',
	overdue: 'Overdue',
	to_do: 'To do'
};

/** A student's status on a piece of work, from when they first completed it (if they have). */
export function workStatus(dueDate: string, firstCompleted: string | null, now = Date.now()): WorkStatus {
	if (firstCompleted) return dayKey(firstCompleted) <= dueDate ? 'done' : 'late';
	return dayKey(new Date(now).toISOString()) > dueDate ? 'overdue' : 'to_do';
}

interface CompletionRow {
	assignment_id: number;
	student_id: number;
	attempts: number;
	first_completed: string;
	best: number | null;
}

/** For each (assignment, student): how many completed attempts, the first completion and the best score. */
async function completions(db: D1Database, assignmentIds: number[]): Promise<CompletionRow[]> {
	if (assignmentIds.length === 0) return [];
	const { results } = await db
		.prepare(
			`SELECT assignment_id, student_id, COUNT(*) AS attempts, MIN(completed_at) AS first_completed,
			        MAX(CASE WHEN max_score > 0 THEN score * 1.0 / max_score END) AS best
			 FROM attempts
			 WHERE assignment_id IN (${assignmentIds.map(() => '?').join(',')}) AND completed_at IS NOT NULL
			 GROUP BY assignment_id, student_id`
		)
		.bind(...assignmentIds)
		.all<CompletionRow>();
	return results;
}

export interface TeacherAssignment extends Assignment {
	done: number;
	students: { id: number; username: string; status: WorkStatus; label: string; best: number | null; attempts: number }[];
}

/** The group's set work, newest due date first, with every student's status. */
export async function groupAssignments(db: D1Database, teacher: Teacher, groupId: unknown, now = Date.now()): Promise<TeacherAssignment[]> {
	const group = await groupFor(db, teacher, groupId);
	const [{ results: rows }, { results: students }] = await Promise.all([
		db.prepare(`SELECT ${COLUMNS} FROM assignments WHERE group_id = ? ORDER BY due_date DESC, id DESC`).bind(group.id).all<AssignmentRow>(),
		db.prepare('SELECT id, username FROM students WHERE group_id = ? ORDER BY username COLLATE NOCASE').bind(group.id).all<{ id: number; username: string }>()
	]);
	const done = await completions(db, rows.map((r) => r.id));
	return rows.map(fromRow).map((a) => {
		const list = students.map((s) => {
			const c = done.find((d) => d.assignment_id === a.id && d.student_id === s.id);
			const status = workStatus(a.due_date, c?.first_completed ?? null, now);
			return { id: s.id, username: s.username, status, label: WORK_LABELS[status], best: c?.best ?? null, attempts: c?.attempts ?? 0 };
		});
		return { ...a, done: list.filter((s) => s.status === 'done' || s.status === 'late').length, students: list };
	});
}

export interface StudentAssignment extends Assignment {
	status: WorkStatus;
	label: string;
	best: number | null;
	/** An assessment that's been done can't be started again. */
	can_start: boolean;
}

/** The student's set work: anything not yet done first (soonest due), then what's done. */
export async function studentAssignments(db: D1Database, student: Student, now = Date.now()): Promise<StudentAssignment[]> {
	const { results } = await db
		.prepare(`SELECT ${COLUMNS} FROM assignments WHERE group_id = ? ORDER BY due_date, id`)
		.bind(student.group_id)
		.all<AssignmentRow>();
	const done = (await completions(db, results.map((r) => r.id))).filter((c) => c.student_id === student.id);
	const list = results.map(fromRow).map((a) => {
		const c = done.find((d) => d.assignment_id === a.id);
		const status = workStatus(a.due_date, c?.first_completed ?? null, now);
		return { ...a, status, label: WORK_LABELS[status], best: c?.best ?? null, can_start: !(a.assessment && c) };
	});
	const open = (s: WorkStatus) => s === 'to_do' || s === 'overdue';
	return [...list.filter((a) => open(a.status)), ...list.filter((a) => !open(a.status)).reverse()];
}

/** A piece of work set for this student's group, or a 404. */
export async function assignmentForStudent(db: D1Database, student: Student, assignmentId: unknown): Promise<Assignment> {
	const row = await db
		.prepare(`SELECT ${COLUMNS} FROM assignments WHERE id = ? AND group_id = ?`)
		.bind(Number(assignmentId), student.group_id)
		.first<AssignmentRow>();
	if (!row) throw new QuizError(404, "That work wasn't found. Ask your teacher.");
	return fromRow(row);
}

/** What to draw for a piece of set work. */
export function planRequestFor(a: Assignment, allTopics: string[]): PlanRequest {
	if (a.kind === 'topic') return { mode: 'topic', quiz_id: a.quiz_id! };
	if (a.kind === 'mixed') return { mode: 'mixed', topics: a.topics! };
	return { mode: 'mixed', topics: allTopics, spec_points: a.spec_points! };
}
