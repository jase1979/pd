// GET  /api/teacher/login: which sign-in method is switched on ("password" or "link").
// POST /api/teacher/login { email, password, remember }: password sign-in, when
//      TEACHER_PASSWORD_HASH is set. Otherwise { email, remember } emails a
//      sign-in link if the address is allowed (the reply is the same either way).

import { passwordSignIn, requestSignInLink, resendMailer, setTeacherCookie } from '$lib/server/teachers';
import { QuizError } from '$lib/server/quiz/attempts';
import { api, clientIp, database, environmentOf, readJson } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(({ platform }) => ({
	method: platform?.env.TEACHER_PASSWORD_HASH ? 'password' : 'link'
}));

export const POST: RequestHandler = api(async ({ request, platform, url, cookies, getClientAddress }) => {
	const body = await readJson(request);
	const env = platform?.env;
	const db = database(platform);
	const ip = clientIp(request, getClientAddress);
	const remember = body.remember === true;

	if (env?.TEACHER_PASSWORD_HASH) {
		const r = await passwordSignIn(db, {
			email: body.email,
			password: body.password,
			remember,
			ip,
			allowList: env.TEACHER_EMAILS,
			passwordHash: env.TEACHER_PASSWORD_HASH
		});
		if (!r.ok) throw new QuizError(r.status, r.message);
		setTeacherCookie(cookies, r.sessionToken, r.remember, r.expires);
		return { ok: true, signed_in: true };
	}

	const r = await requestSignInLink(db, {
		email: body.email,
		remember,
		ip,
		origin: url.origin,
		allowList: env?.TEACHER_EMAILS,
		mailer: resendMailer(env?.RESEND_API_KEY, env?.MAIL_FROM),
		// The link itself is only ever shown on screen in local development.
		dev: environmentOf(platform) === 'dev' && !env?.RESEND_API_KEY
	});
	if (!r.ok) throw new QuizError(r.status, r.message);
	return { ok: true, ...(r.devLink && { dev_link: r.devLink }) };
});
