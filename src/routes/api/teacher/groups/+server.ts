// GET  /api/teacher/groups: the teacher's groups, with the year-end reminder.
// POST /api/teacher/groups { name, spec, retry_cooldown_hours? }: create one.

import { createGroup, listGroups, needsDeleting } from '$lib/server/groups';
import { api, database, readJson, requireTeacher } from '$lib/server/quiz/http';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = api(async ({ platform, locals }) => {
	const groups = await listGroups(database(platform), requireTeacher(locals));
	return { groups: groups.map((g) => ({ ...g, needs_deleting: needsDeleting(g) })) };
});

export const POST: RequestHandler = api(async ({ request, platform, locals }) =>
	createGroup(database(platform), requireTeacher(locals), await readJson(request))
);
