// GET  /api/teacher/verify?token=  what the link would do, WITHOUT spending it.
// POST /api/teacher/verify { token }  spend it and start the session.
//
// Mail scanners open links to check them, so opening the link must never sign
// anyone in: the page shows a button, and only the POST spends the link.

import { peekSignInLink, setTeacherCookie, useSignInLink } from '$lib/server/teachers';
import { QuizError } from '$lib/server/quiz/attempts';
import { api, database, readJson } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(async ({ url, platform }) => peekSignInLink(database(platform), url.searchParams.get('token')));

export const POST: RequestHandler = api(async ({ request, platform, cookies }) => {
	const body = await readJson(request);
	const r = await useSignInLink(database(platform), body.token, platform?.env.TEACHER_EMAILS);
	if (!r) throw new QuizError(400, 'This sign-in link has expired or has already been used. Ask for a new one.');
	setTeacherCookie(cookies, r.sessionToken, r.remember, r.expires);
	return { email: r.teacher.email };
});
