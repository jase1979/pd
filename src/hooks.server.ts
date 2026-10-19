// Runs on every request that reaches the server code. Pages are prerendered
// static files, so in practice that's the /api/* routes.
//
// Resolves the session cookies to a student and/or a teacher and stashes
// them on locals. This doesn't enforce anything: each route decides who it
// needs (see requireStudent / requireTeacher in lib/server/quiz/http.ts).

import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { NAME_COOKIE, SESSION_COOKIE, studentForToken } from '$lib/server/students';
import { TEACHER_COOKIE, isAllowedTeacher, normaliseEmail, teacherByEmail, teacherForToken } from '$lib/server/teachers';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.student = null;
	event.locals.teacher = null;
	// Prerendering the pages at build time has no database (or visitor), and
	// only the API needs to know who's logged in.
	if (building || !event.url.pathname.startsWith('/api/')) return resolve(event);
	const env = event.platform?.env;
	const db = env?.DB;
	if (!db) return resolve(event);

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		event.locals.student = await studentForToken(db, token);
		// An expired or reset session: tidy away the cookies so the header
		// stops showing a username.
		if (!event.locals.student) {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
			event.cookies.delete(NAME_COOKIE, { path: '/' });
		}
	}

	if (event.url.pathname.startsWith('/api/teacher/')) {
		const teacher = await teacherForToken(db, event.cookies.get(TEACHER_COOKIE));
		// Taking an address off TEACHER_EMAILS ends its sessions straight away.
		if (teacher && isAllowedTeacher(teacher.email, env.TEACHER_EMAILS)) event.locals.teacher = teacher;
		// Local development only: sign in as DEV_TEACHER_EMAIL without an email.
		// Never active unless ENVIRONMENT is exactly "dev".
		const devEmail = normaliseEmail(env.DEV_TEACHER_EMAIL);
		if (!event.locals.teacher && env.ENVIRONMENT === 'dev' && devEmail) {
			event.locals.teacher = await teacherByEmail(db, devEmail);
		}
	}
	return resolve(event);
};
