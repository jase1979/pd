// GET    /api/teacher/groups/:id  the group, its students (with codes) and the teacher's other groups
// PATCH  /api/teacher/groups/:id  { name?, spec?, retry_cooldown_hours?, archived? }
// DELETE /api/teacher/groups/:id  { confirm_name }  permanently, with everything in it

import { deleteGroup, groupFor, groupStudents, listGroups, needsDeleting, updateGroup } from '$lib/server/groups';
import { formatCode } from '$lib/server/codes';
import { api, database, readJson, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(async ({ params, platform, locals }) => {
	const db = database(platform);
	const teacher = requireTeacher(locals);
	const group = await groupFor(db, teacher, params.id);
	const [students, groups] = await Promise.all([groupStudents(db, group.id), listGroups(db, teacher)]);
	return {
		group: { ...group, needs_deleting: needsDeleting(group) },
		students: students.map((s) => ({ ...s, login_code: formatCode(s.login_code) })),
		other_groups: groups.filter((g) => g.id !== group.id).map((g) => ({ id: g.id, name: g.name }))
	};
});

export const PATCH: RequestHandler = api(async ({ params, request, platform, locals }) =>
	updateGroup(database(platform), requireTeacher(locals), params.id, await readJson(request))
);

export const DELETE: RequestHandler = api(async ({ params, request, platform, locals }) => {
	const body = await readJson(request);
	await deleteGroup(database(platform), requireTeacher(locals), params.id, body.confirm_name);
	return { ok: true };
});
