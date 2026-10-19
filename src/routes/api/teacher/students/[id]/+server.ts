// GET    /api/teacher/students/:id: the student's full profile
// PATCH  /api/teacher/students/:id { username?, group_id? }: rename or move
// DELETE /api/teacher/students/:id: remove, with everything they did

import { groupFor, removeStudent, studentFor, updateStudent } from '$lib/server/groups';
import { loadHistory } from '$lib/server/history';
import { studentProfile } from '$lib/server/analysis';
import { quizzesForSpec } from '$lib/server/teacher-data';
import { api, database, environmentOf, readJson, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(async ({ params, platform, locals }) => {
	const db = database(platform);
	const teacher = requireTeacher(locals);
	const student = await studentFor(db, teacher, params.id);
	const group = await groupFor(db, teacher, student.group_id);
	const row = await db.prepare('SELECT last_active_at FROM students WHERE id = ?').bind(student.id).first<{ last_active_at: string | null }>();
	const history = await loadHistory(db, student.id);
	const quizzes = quizzesForSpec(group.spec, environmentOf(platform));
	return {
		group: { id: group.id, name: group.name },
		quiz_titles: Object.fromEntries(quizzes.map((q) => [q.id, q.title])),
		...studentProfile({ ...student, last_active_at: row?.last_active_at ?? null }, history, quizzes)
	};
});

export const PATCH: RequestHandler = api(async ({ params, request, platform, locals }) =>
	updateStudent(database(platform), requireTeacher(locals), params.id, await readJson(request))
);

export const DELETE: RequestHandler = api(async ({ params, platform, locals }) => {
	await removeStudent(database(platform), requireTeacher(locals), params.id);
	return { ok: true };
});
