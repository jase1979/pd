// POST /api/teacher/logout

import { TEACHER_COOKIE } from '$lib/server/teachers';
import { endSession } from '$lib/server/students';
import { api } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = api(async ({ platform, cookies }) => {
	const db = platform?.env.DB;
	if (db) await endSession(db, cookies.get(TEACHER_COOKIE));
	cookies.delete(TEACHER_COOKIE, { path: '/' });
	return { ok: true };
});
