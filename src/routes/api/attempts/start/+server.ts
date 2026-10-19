// POST /api/attempts/start { mode: "topic", quiz_id }
// Picks the questions and returns them WITHOUT answers or explanations, plus
// a signed token recording which questions were served.

import { getQuiz } from '$lib/server/quiz/bank';
import { QuizError, startAttempt } from '$lib/server/quiz/attempts';
import { api, environmentOf, readJson, signingSecret } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = api(async ({ request, platform }) => {
	const body = await readJson(request);
	// Only topic mode exists so far; the others arrive in Phase 2.
	if (body.mode !== 'topic') throw new QuizError(400, 'mode should be "topic".');
	const quiz = typeof body.quiz_id === 'string' ? getQuiz(body.quiz_id) : undefined;
	if (!quiz) throw new QuizError(404, 'No such quiz.');
	return startAttempt(quiz, environmentOf(platform), signingSecret(platform));
});
