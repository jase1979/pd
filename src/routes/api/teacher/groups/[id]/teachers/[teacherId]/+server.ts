// DELETE /api/teacher/groups/:id/teachers/:teacherId: stop sharing the group with a teacher.

import { unshareGroup } from '$lib/server/groups';
import { api, database, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const DELETE: RequestHandler = api(async ({ params, platform, locals }) => {
	await unshareGroup(database(platform), requireTeacher(locals), params.id, params.teacherId);
	return { ok: true };
});
