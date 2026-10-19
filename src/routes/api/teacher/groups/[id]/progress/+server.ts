// GET /api/teacher/groups/:id/progress?by=topic|spec_point|command
// The heatmap (students against topics, spec points or command words) and
// the group summary.

import { groupSummary, heatmap, type HeatmapBy } from '$lib/server/analysis';
import { groupData } from '$lib/server/teacher-data';
import { api, database, environmentOf, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(async ({ params, url, platform, locals }) => {
	const by = (['topic', 'spec_point', 'command'].includes(url.searchParams.get('by') ?? '') ? url.searchParams.get('by') : 'topic') as HeatmapBy;
	const { history, quizzes } = await groupData(database(platform), requireTeacher(locals), params.id, environmentOf(platform));
	return { heatmap: heatmap(by, history, quizzes), summary: groupSummary(history, quizzes) };
});
