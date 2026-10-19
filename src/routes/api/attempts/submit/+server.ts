// POST /api/attempts/submit { attempt_id | token, answers: [{ question_id, chosen, dont_know, confidence, not_reached? }] }
// Marks every answer, saves them for a logged-in student, and returns
// everything the feedback screen needs.

import { quizzes } from '$lib/server/quiz/bank';
import { submitAttempt } from '$lib/server/quiz/attempts';
import { api, environmentOf, readJson, signingSecret } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = api(async ({ request, platform, locals }) => {
	const body = await readJson(request);
	return submitAttempt(body, {
		quizzes,
		environment: environmentOf(platform),
		secret: signingSecret(platform),
		db: platform?.env.DB,
		student: locals.student
	});
});
