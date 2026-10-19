// PATCH  /api/teacher/students/:id { username?, group_id? }: rename or move
// DELETE /api/teacher/students/:id: remove, with everything they did

import { removeStudent, updateStudent } from '$lib/server/groups';
import { api, database, readJson, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const PATCH: RequestHandler = api(async ({ params, request, platform, locals }) =>
	updateStudent(database(platform), requireTeacher(locals), params.id, await readJson(request))
);

export const DELETE: RequestHandler = api(async ({ params, platform, locals }) => {
	await removeStudent(database(platform), requireTeacher(locals), params.id);
	return { ok: true };
});
