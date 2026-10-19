// GET  /api/teacher/groups/:id/teachers: who can see this group
// POST /api/teacher/groups/:id/teachers { email }: share it with another teacher

import { groupTeachers, shareGroup } from '$lib/server/groups';
import { isAllowedTeacher, normaliseEmail } from '$lib/server/teachers';
import { QuizError } from '$lib/server/quiz/attempts';
import { api, database, readJson, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(async ({ params, platform, locals }) => ({
	teachers: await groupTeachers(database(platform), requireTeacher(locals), params.id)
}));

export const POST: RequestHandler = api(async ({ params, request, platform, locals }) => {
	const email = normaliseEmail((await readJson(request)).email);
	if (!email) throw new QuizError(400, 'Enter their school email address.');
	const teachers = await shareGroup(database(platform), requireTeacher(locals), params.id, email);
	// Sharing works either way, but they can't sign in until they're allowed to.
	return { teachers, can_sign_in: isAllowedTeacher(email, platform?.env.TEACHER_EMAILS) };
});
