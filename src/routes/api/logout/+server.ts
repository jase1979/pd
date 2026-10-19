// POST /api/logout: ends this session and clears the cookies.

import { SESSION_COOKIE, clearLoginCookies, endSession } from '$lib/server/students';
import { api } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = api(async ({ platform, cookies }) => {
	const db = platform?.env.DB;
	if (db) await endSession(db, cookies.get(SESSION_COOKIE));
	clearLoginCookies(cookies);
	return { ok: true };
});
