// DELETE /api/teacher/assignments/:id: remove set work (students' answers are kept).

import { deleteAssignment } from '$lib/server/assignments';
import { api, database, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const DELETE: RequestHandler = api(async ({ params, platform, locals }) => {
	await deleteAssignment(database(platform), requireTeacher(locals), params.id);
	return { ok: true };
});
