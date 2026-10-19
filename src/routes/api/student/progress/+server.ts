// GET /api/student/progress: everything the /progress/ page and the topic
// badges need, for the logged-in student.

import { quizzes } from '$lib/server/quiz/bank';
import { quizInfo } from '$lib/server/quiz/modes';
import { loadHistory } from '$lib/server/history';
import { buildProgress } from '$lib/server/progress';
import { quizMeta } from '$lib/server/quiz/attempts';
import { api, database, environmentOf, requireStudent } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(async ({ platform, locals }) => {
	const student = requireStudent(locals);
	const environment = environmentOf(platform);
	const available = quizzes.filter((q) => quizMeta(q, environment).available).map((q) => quizInfo(q, environment));
	const history = await loadHistory(database(platform), student.id);
	return buildProgress(student.username, available, history);
});
