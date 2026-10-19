// GET /api/student/assignments: the work set for the student's group, with their status.

import { studentAssignments } from '$lib/server/assignments';
import { api, database, requireStudent } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(async ({ platform, locals }) => ({
	assignments: await studentAssignments(database(platform), requireStudent(locals))
}));
