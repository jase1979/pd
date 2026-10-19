// GET /api/teacher/starter?group_id=&topics=weakest|<quiz id>,<quiz id>&n=5
//
// Questions for the lesson-starter board view, INCLUDING the answers, every
// why_wrong and the explanations: the one place answers are sent before
// anyone has answered, which is why it's teacher-only. Nothing is saved.
// "weakest" means the two topics with the group's lowest average mastery.

import { topicProgress } from '$lib/server/progress';
import { quizzes } from '$lib/server/quiz/bank';
import { QuizError, servableQuestions } from '$lib/server/quiz/attempts';
import { drawWeighted } from '$lib/server/quiz/select';
import { groupData } from '$lib/server/teacher-data';
import { STARTER_DEFAULT_QUESTIONS } from '$lib/server/config';
import { api, database, environmentOf, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(async ({ url, platform, locals }) => {
	const environment = environmentOf(platform);
	const { history, quizzes: available } = await groupData(database(platform), requireTeacher(locals), url.searchParams.get('group_id'), environment);
	const n = Math.min(20, Math.max(1, Number(url.searchParams.get('n')) || STARTER_DEFAULT_QUESTIONS));
	const wanted = url.searchParams.get('topics') ?? 'weakest';

	let topicIds: string[];
	if (wanted === 'weakest') {
		const averages = available
			.map((q) => {
				const masteries = history.students
					.map((s) => topicProgress(q, history.histories.get(s.id)!).mastery)
					.filter((m): m is number => m !== undefined);
				return { id: q.id, mastery: masteries.length ? masteries.reduce((a, b) => a + b, 0) / masteries.length : null };
			})
			.filter((x) => x.mastery !== null)
			.sort((a, b) => a.mastery! - b.mastery!);
		// No answers yet: any topic will do.
		topicIds = (averages.length ? averages : available.map((q) => ({ id: q.id }))).slice(0, 2).map((x) => x.id);
	} else {
		topicIds = wanted.split(',').filter((id) => available.some((q) => q.id === id));
	}
	const chosen = quizzes.filter((q) => topicIds.includes(q.id));
	if (chosen.length === 0) throw new QuizError(400, 'Choose at least one topic with a quiz.');

	const picked = drawWeighted(
		chosen.map((quiz) => ({ quiz_id: quiz.id, weight: 1, questions: servableQuestions(quiz, environment) })),
		n
	);
	return {
		topics: chosen.map((q) => ({ id: q.id, title: q.topic })),
		questions: picked.map((q) => {
			const quiz = chosen.find((x) => x.questions.includes(q))!;
			return { ...q, scenario: q.scenario ? quiz.scenarios.find((s) => s.id === q.scenario) : undefined };
		})
	};
});
