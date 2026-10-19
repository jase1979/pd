// POST /api/student/login { code, remember } -> sets the session cookie.

import { loginWithCode, setLoginCookies } from '$lib/server/students';
import { QuizError } from '$lib/server/quiz/attempts';
import { api, database, readJson } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = api(async ({ request, platform, cookies, getClientAddress }) => {
	const body = await readJson(request);
	const remember = body.remember === true;
	// Cloudflare puts the visitor's real IP address in this header.
	const ip = request.headers.get('cf-connecting-ip') ?? getClientAddress();
	const r = await loginWithCode(database(platform), { code: body.code, remember, ip });
	if (!r.ok) throw new QuizError(r.status, r.message);
	setLoginCookies(cookies, r.token, r.student.username, remember, r.expires);
	return { username: r.student.username };
});
