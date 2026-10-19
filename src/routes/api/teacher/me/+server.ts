// GET /api/teacher/me: the signed-in teacher, or null.

import { api } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(({ locals }) => ({ teacher: locals.teacher ? { email: locals.teacher.email } : null }));
