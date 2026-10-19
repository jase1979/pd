// Who is logged in, as the browser sees it. Pages are static, so this reads
// the readable pd_user cookie set at login (see lib/server/students.ts)
// instead of asking the server on every page view. The server never trusts
// it: every saved action checks the HttpOnly session cookie.

import { browser } from '$app/environment';

function readUsername(): string | null {
	if (!browser) return null;
	const match = document.cookie.match(/(?:^|;\s*)pd_user=([^;]*)/);
	return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Shared, reactive: the header and the quiz both update when it changes.
 * Starts empty so the first render matches the prerendered HTML; the layout
 * calls refreshSession() once mounted. Components that need it sooner
 * (children mount before the layout) call refreshSession() themselves.
 */
export const session = $state({ username: null as string | null, checked: false });

/** Read the cookie. Called once the page is running in the browser. */
export function refreshSession() {
	session.username = readUsername();
	session.checked = true;
}

export async function logOut() {
	await fetch('/api/logout', { method: 'POST' }).catch(() => {});
	session.username = null;
	// Back to the same page, logged out, so nothing from the last student lingers on screen.
	location.reload();
}

/** Record a notes-page view for the logged-in student. Anonymous visitors send nothing. */
export function trackPageView(path: string) {
	if (!session.username || !path.startsWith('/gcse/')) return;
	navigator.sendBeacon?.('/api/track/page', JSON.stringify({ path }));
}
