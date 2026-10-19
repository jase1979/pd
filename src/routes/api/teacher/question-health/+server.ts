// GET /api/teacher/question-health[?format=csv]: question health across every
// group the teacher can see. For improving the questions; only questions with
// enough answers are judged (see QUESTION_HEALTH in config.ts).

import { indexQuestions, questionHealth } from '$lib/server/analysis';
import { csv } from '$lib/server/groups';
import { quizzes } from '$lib/server/quiz/bank';
import { allGroupsData } from '$lib/server/teacher-data';
import { QUESTION_HEALTH } from '$lib/server/config';
import { api, database, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

const pct = (x: number | null) => (x === null ? '' : String(Math.round(x * 100)));

export const GET: RequestHandler = async (event) => {
	if (event.url.searchParams.get('format') !== 'csv') {
		return api(async ({ platform, locals }) => {
			const health = questionHealth(await allGroupsData(database(platform), requireTeacher(locals)), indexQuestions(quizzes));
			return { min_answers: QUESTION_HEALTH.min_answers, questions: health };
		})(event);
	}
	const { platform, locals } = event;
	const teacher = locals.teacher;
	if (!teacher) return new Response('Please sign in as a teacher.', { status: 401 });
	const health = questionHealth(await allGroupsData(database(platform), teacher), indexQuestions(quizzes));
	const rows = [
		['question id', 'quiz file', 'answers', 'correct %', "I don't know %", 'confidently wrong %', 'discrimination', 'flags'],
		...health.map((h) => [
			h.question_id,
			h.file,
			String(h.answers),
			pct(h.correct_rate),
			pct(h.dont_know_rate),
			pct(h.confidently_wrong_rate),
			h.discrimination === null ? '' : h.discrimination.toFixed(2),
			h.flags.map((f) => `${f.kind.replace(/_/g, ' ')}: ${f.text}`).join('; ')
		])
	];
	return new Response(csv(rows), {
		headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="question-health.csv"', 'cache-control': 'no-store' }
	});
};
