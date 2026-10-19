// GET /api/me: who is logged in, or nobody.

import { api } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(({ locals }) => ({
	student: locals.student ? { username: locals.student.username } : null
}));
