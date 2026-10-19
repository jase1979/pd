// GET /api/teacher/groups/:id/codes.csv: usernames and login codes.

import { csv, groupFor, groupStudents } from '$lib/server/groups';
import { formatCode } from '$lib/server/codes';
import { QuizError } from '$lib/server/quiz/attempts';
import { database, requireTeacher } from '$lib/server/quiz/http';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ params, platform, locals }) => {
	try {
		const db = database(platform);
		const group = await groupFor(db, requireTeacher(locals), params.id);
		const students = await groupStudents(db, group.id);
		const body = csv([['username', 'code'], ...students.map((s) => [s.username, formatCode(s.login_code)])]);
		const file = `${group.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'group'}-codes.csv`;
		return new Response(body, {
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': `attachment; filename="${file}"`,
				'cache-control': 'no-store'
			}
		});
	} catch (e) {
		if (e instanceof QuizError) error(e.status, e.message);
		throw e;
	}
};
