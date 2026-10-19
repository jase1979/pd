// POST /api/teacher/groups/:id/students/preview { text }: what a paste of
// usernames would create and what it would skip, with reasons. Creates nothing.

import { previewStudents } from '$lib/server/groups';
import { api, database, readJson, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = api(async ({ params, request, platform, locals }) => {
	const body = await readJson(request);
	return previewStudents(database(platform), requireTeacher(locals), params.id, body.text);
});
