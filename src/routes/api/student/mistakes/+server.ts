// GET /api/student/mistakes: how many questions are waiting in "Practise my
// mistakes", per topic and in total.

import { quizzes } from '$lib/server/quiz/bank';
import { servableQuestions } from '$lib/server/quiz/attempts';
import { loadHistory } from '$lib/server/history';
import { mistakeList } from '$lib/server/progress';
import { api, database, environmentOf, requireStudent } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(async ({ platform, locals }) => {
	const student = requireStudent(locals);
	const environment = environmentOf(platform);
	const servable = new Set(quizzes.flatMap((q) => servableQuestions(q, environment).map((x) => x.id)));
	const history = await loadHistory(database(platform), student.id);
	const list = mistakeList(history.answers).filter((m) => servable.has(m.question_id));
	const byQuiz = new Map<string, number>();
	for (const m of list) byQuiz.set(m.quiz_id, (byQuiz.get(m.quiz_id) ?? 0) + 1);
	return { total: list.length, by_quiz: [...byQuiz].map(([quiz_id, count]) => ({ quiz_id, count })) };
});
