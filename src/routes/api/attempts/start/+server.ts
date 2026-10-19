// POST /api/attempts/start { mode, quiz_id?, topics? }
// Picks the questions for the mode and returns them WITHOUT answers or
// explanations, plus an attempt id (logged in) or a signed token (anonymous).

import { quizzes } from '$lib/server/quiz/bank';
import { startAttempt } from '$lib/server/quiz/attempts';
import { api, environmentOf, readJson, signingSecret } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = api(async ({ request, platform, locals }) => {
	const body = await readJson(request);
	return startAttempt(
		{ mode: body.mode as never, quiz_id: body.quiz_id as string | undefined, topics: body.topics as string[] | undefined },
		{
			quizzes,
			environment: environmentOf(platform),
			secret: signingSecret(platform),
			db: platform?.env.DB,
			student: locals.student
		}
	);
});
