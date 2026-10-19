// Runs on every request that reaches the server code. Pages are prerendered
// static files, so in practice that's the /api/* routes.
//
// Resolves the session cookie to a student and stashes it on locals. This
// doesn't enforce anything: each route decides whether it needs a student.

import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { NAME_COOKIE, SESSION_COOKIE, studentForToken } from '$lib/server/students';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.student = null;
	// Prerendering the pages at build time has no database (or visitor), and
	// only the API needs to know who's logged in.
	if (building || !event.url.pathname.startsWith('/api/')) return resolve(event);
	const token = event.cookies.get(SESSION_COOKIE);
	const db = event.platform?.env.DB;
	if (token && db) {
		event.locals.student = await studentForToken(db, token);
		// An expired or reset session: tidy away the cookies so the header
		// stops showing a username.
		if (!event.locals.student) {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
			event.cookies.delete(NAME_COOKIE, { path: '/' });
		}
	}
	return resolve(event);
};
