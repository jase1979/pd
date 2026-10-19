// GET  /api/teacher/groups/:id/assignments: the group's set work, with every student's status
// POST /api/teacher/groups/:id/assignments { kind, quiz_id?, topics?, due_date, assessment?, title? }

import { createAssignment, groupAssignments, planRequestFor } from '$lib/server/assignments';
import { groupSummary } from '$lib/server/analysis';
import { groupData } from '$lib/server/teacher-data';
import { quizzes } from '$lib/server/quiz/bank';
import { planAttempt } from '$lib/server/quiz/modes';
import { QuizError } from '$lib/server/quiz/attempts';
import { api, database, environmentOf, readJson, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(async ({ params, platform, locals }) => ({
	assignments: await groupAssignments(database(platform), requireTeacher(locals), params.id)
}));

export const POST: RequestHandler = api(async ({ params, request, platform, locals }) => {
	const db = database(platform);
	const teacher = requireTeacher(locals);
	const environment = environmentOf(platform);
	const body = await readJson(request);
	const { history, quizzes: available } = await groupData(db, teacher, params.id, environment);
	const assignment = await createAssignment(db, teacher, params.id, body, {
		topics: available.map((q) => ({ id: q.id, title: q.title })),
		weakestSpecPoints: async () => groupSummary(history, available).weakest_spec_points.map((s) => s.spec_point)
	});

	// Make sure the work can actually be drawn, before any student tries.
	try {
		planAttempt(planRequestFor(assignment, available.map((q) => q.id)), { quizzes, environment });
	} catch (e) {
		await db.prepare('DELETE FROM assignments WHERE id = ?').bind(assignment.id).run();
		throw e instanceof QuizError ? new QuizError(409, `That can't be set yet: ${e.message}`) : e;
	}
	return assignment;
});
