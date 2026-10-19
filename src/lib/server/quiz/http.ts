// Shared plumbing for the quiz API routes.
//
// Errors are always sent as JSON ({ message }) with no-store, rather than via
// SvelteKit's error(), which answers a browser's fetch() with an HTML page.

import { json, type RequestHandler } from '@sveltejs/kit';
import { QuizError } from './attempts';

/** ENVIRONMENT, defaulting to production so a missing variable never serves drafts. */
export function environmentOf(platform: App.Platform | undefined): string {
	return platform?.env.ENVIRONMENT || 'production';
}

export function signingSecret(platform: App.Platform | undefined): string {
	const secret = platform?.env.QUIZ_SIGNING_SECRET;
	if (!secret) {
		console.error('QUIZ_SIGNING_SECRET is not set; see wrangler.toml');
		throw new QuizError(500, 'The quiz is not set up on this server yet.');
	}
	return secret;
}

/** The D1 database; every student route needs it. */
export function database(platform: App.Platform | undefined): D1Database {
	const db = platform?.env.DB;
	if (!db) throw new QuizError(500, 'The database is not set up on this server.');
	return db;
}

/** The logged-in student, or a 401. */
export function requireStudent(locals: App.Locals) {
	if (!locals.student) throw new QuizError(401, 'Please log in first.');
	return locals.student;
}

/** The request body as an object, or a 400. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
	try {
		const body = await request.json();
		if (typeof body === 'object' && body !== null && !Array.isArray(body)) return body as Record<string, unknown>;
	} catch {
		// fall through
	}
	throw new QuizError(400, 'The request should be a JSON object.');
}

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * Wrap a route handler: its return value is sent as JSON, and a QuizError
 * becomes { message } with that status. Nothing is ever cached.
 */
export function api<E extends Parameters<RequestHandler>[0]>(
	handler: (event: E) => unknown | Promise<unknown>
): (event: E) => Promise<Response> {
	return async (event) => {
		try {
			return json(await handler(event), { headers: NO_STORE });
		} catch (e) {
			if (e instanceof QuizError) return json({ message: e.message }, { status: e.status, headers: NO_STORE });
			console.error(e);
			return json({ message: 'Something went wrong. Please try again.' }, { status: 500, headers: NO_STORE });
		}
	};
}
