// GET /api/teacher/groups/:id/export.csv: the markbook, one row per student.

import { error } from '@sveltejs/kit';
import { markbook } from '$lib/server/analysis';
import { csv } from '$lib/server/groups';
import { groupData } from '$lib/server/teacher-data';
import { QuizError } from '$lib/server/quiz/attempts';
import { database, environmentOf, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ params, platform, locals }) => {
	try {
		const { group, history, quizzes } = await groupData(database(platform), requireTeacher(locals), params.id, environmentOf(platform));
		const file = `${group.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'group'}-markbook.csv`;
		return new Response(csv(markbook(history, quizzes)), {
			headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${file}"`, 'cache-control': 'no-store' }
		});
	} catch (e) {
		if (e instanceof QuizError) error(e.status, e.message);
		throw e;
	}
};
