// POST /api/attempts/submit { token, answers: [{ question_id, chosen, dont_know, confidence }] }
// Marks every answer and returns everything the feedback screen needs.

import { getQuiz } from '$lib/server/quiz/bank';
import { submitAttempt } from '$lib/server/quiz/attempts';
import { api, readJson, signingSecret } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = api(async ({ request, platform }) => {
	const body = await readJson(request);
	return submitAttempt(body, signingSecret(platform), getQuiz);
});
