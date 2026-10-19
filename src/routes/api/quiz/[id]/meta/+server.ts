// GET /api/quiz/:id/meta: the quiz's title, whether it's available and how
// many questions an attempt has. For a logged-in student, also any cooldown
// and whether they've done it before. The topic page uses this to decide
// whether to show the quiz at all.

import { getQuiz } from '$lib/server/quiz/bank';
import { QuizError, quizMeta } from '$lib/server/quiz/attempts';
import { cooldownUntil } from '$lib/server/history';
import { api, environmentOf } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(async ({ params, platform, locals }) => {
	const quiz = getQuiz(params.id);
	if (!quiz) throw new QuizError(404, 'No such quiz.');
	const meta = quizMeta(quiz, environmentOf(platform));
	const db = platform?.env.DB;
	if (!locals.student || !db) return meta;
	const [until, done] = await Promise.all([
		cooldownUntil(db, locals.student.id, locals.student.group_id, quiz.id),
		db
			.prepare("SELECT 1 FROM attempts WHERE student_id = ? AND mode = 'topic' AND quiz_id = ? AND completed_at IS NOT NULL LIMIT 1")
			.bind(locals.student.id, quiz.id)
			.first()
	]);
	return { ...meta, cooldown_until: until?.toISOString() ?? null, attempted: !!done };
});
