// POST /api/teacher/groups/:id/students/bulk { usernames: [...] }: create the
// students, each with a new permanent login code, in one batch.

import { addStudents } from '$lib/server/groups';
import { formatCode } from '$lib/server/codes';
import { api, database, readJson, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = api(async ({ params, request, platform, locals }) => {
	const body = await readJson(request);
	const r = await addStudents(database(platform), requireTeacher(locals), params.id, body.usernames);
	return { created: r.created.map((c) => ({ ...c, code: formatCode(c.code) })), skip: r.skip };
});
