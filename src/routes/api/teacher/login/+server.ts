// POST /api/teacher/login { email, remember }: email a sign-in link, if the
// address is allowed. The reply is the same either way.

import { requestSignInLink, resendMailer } from '$lib/server/teachers';
import { QuizError } from '$lib/server/quiz/attempts';
import { api, clientIp, database, environmentOf, readJson } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = api(async ({ request, platform, url, getClientAddress }) => {
	const body = await readJson(request);
	const env = platform?.env;
	const r = await requestSignInLink(database(platform), {
		email: body.email,
		remember: body.remember === true,
		ip: clientIp(request, getClientAddress),
		origin: url.origin,
		allowList: env?.TEACHER_EMAILS,
		mailer: resendMailer(env?.RESEND_API_KEY, env?.MAIL_FROM),
		// The link itself is only ever shown on screen in local development.
		dev: environmentOf(platform) === 'dev' && !env?.RESEND_API_KEY
	});
	if (!r.ok) throw new QuizError(r.status, r.message);
	return { ok: true, ...(r.devLink && { dev_link: r.devLink }) };
});
