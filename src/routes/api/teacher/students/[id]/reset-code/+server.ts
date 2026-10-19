// POST /api/teacher/students/:id/reset-code: a new code. The old one stops
// working immediately, and the student is logged out everywhere.

import { resetCode } from '$lib/server/groups';
import { formatCode } from '$lib/server/codes';
import { api, database, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = api(async ({ params, platform, locals }) => {
	const r = await resetCode(database(platform), requireTeacher(locals), params.id);
	return { ...r, code: formatCode(r.code) };
});
