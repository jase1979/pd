// GET /api/quizzes: every quiz with no answers, for the topic pickers on
// /review/ and /exam-technique/.

import { quizzes } from '$lib/server/quiz/bank';
import { quizMeta, servableQuestions } from '$lib/server/quiz/attempts';
import { api, environmentOf } from '$lib/server/quiz/http';
import type { QuizSummary } from '$lib/quiz/public';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(({ platform }): QuizSummary[] => {
	const environment = environmentOf(platform);
	return quizzes.map((q) => ({
		id: q.id,
		title: q.topic,
		unit: q.unit,
		page: q.page,
		available: quizMeta(q, environment).available,
		exam_skills: servableQuestions(q, environment).filter((x) => x.type === 'exam_skill').length
	}));
});
