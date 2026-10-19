// GET /api/teacher/groups/:id/questions: per-question analysis for this group,
// sorted by confidently-wrong rate (the most stubborn misconceptions first).

import { indexQuestions, questionStats } from '$lib/server/analysis';
import { quizzes } from '$lib/server/quiz/bank';
import { groupData } from '$lib/server/teacher-data';
import { api, database, environmentOf, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(async ({ params, platform, locals }) => {
	const { history } = await groupData(database(platform), requireTeacher(locals), params.id, environmentOf(platform));
	return { questions: questionStats(history.choices, indexQuestions(quizzes)) };
});
