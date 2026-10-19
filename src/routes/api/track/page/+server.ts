// POST /api/track/page { path }, sent with navigator.sendBeacon when a
// logged-in student opens a notes page. Shown to teachers only as a minor
// "notes viewed" indicator; never used in any status or score.

import { trackPage } from '$lib/server/history';
import type { RequestHandler } from './$types';

export const prerender = false;

const NOTES_PAGE = /^\/gcse\/[a-z0-9-]+(\/[a-z0-9-]+){0,3}\/$/;

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const db = platform?.env.DB;
	if (locals.student && db) {
		// sendBeacon sends text/plain, so parse it ourselves.
		const body = await request.text().then((t) => JSON.parse(t)).catch(() => null);
		const path = body?.path;
		// Only paths shaped like notes pages, so the table can't fill with junk.
		// (Checking against the real page list would load every notes page
		// into the server code just for this.)
		if (typeof path === 'string' && NOTES_PAGE.test(path)) await trackPage(db, locals.student.id, path);
	}
	return new Response(null, { status: 204 });
};
