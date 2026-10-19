// GET /api/quiz/:id/meta: the quiz's title, whether it's available, and how
// many questions an attempt has. The topic page uses this to decide whether
// to show the quiz at all. (Cooldown status for logged-in students: Phase 2.)

import { getQuiz } from '$lib/server/quiz/bank';
import { QuizError, quizMeta } from '$lib/server/quiz/attempts';
import { api, environmentOf } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(({ params, platform }) => {
	const quiz = getQuiz(params.id);
	if (!quiz) throw new QuizError(404, 'No such quiz.');
	return quizMeta(quiz, environmentOf(platform));
});
