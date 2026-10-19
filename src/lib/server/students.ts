// Student login: a permanent code, a session cookie, and rate limiting.
//
// - Only a SHA-256 hash of the session token is stored. Someone who could read
//   the database still couldn't use what's in it to log in as a student.
// - By default a login lasts until the browser is closed (no cookie expiry)
//   and at most SESSION_HOURS on the server, because students often share
//   school computers. "Remember me" makes both REMEMBER_DAYS.
// - Failed logins are counted per IP address, hashed (see rate_limits in the
//   migration). Successful logins never count.

import type { Cookies } from '@sveltejs/kit';
import {
	LOGIN_BLOCK_MINUTES,
	LOGIN_MAX_FAILURES,
	REMEMBER_DAYS,
	SESSION_HOURS
} from './config';
import { normaliseCode } from './codes';

/** HttpOnly: the session token. Never readable by page scripts. */
export const SESSION_COOKIE = 'pd_session';
/**
 * The username, readable by page scripts. Not a secret and not trusted by the
 * server: it lets the header show who is logged in, and the page tracker know
 * whether to send anything, without asking the server on every page view.
 */
export const NAME_COOKIE = 'pd_user';

export interface Student {
	id: number;
	username: string;
	group_id: number;
}

const HOUR = 60 * 60 * 1000;

export async function sha256Hex(input: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A random 32-byte token, url-safe base64. */
export function newToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** How long a session lasts, in milliseconds. */
export const sessionLength = (remember: boolean) => (remember ? REMEMBER_DAYS * 24 * HOUR : SESSION_HOURS * HOUR);

/** A new session for a student (or, with userType, a teacher). Returns the raw token for the cookie. */
export async function createSession(
	db: D1Database,
	userId: number,
	remember: boolean,
	now = Date.now(),
	userType: 'student' | 'teacher' = 'student'
) {
	const token = newToken();
	const expires = new Date(now + sessionLength(remember));
	await db
		.prepare('INSERT INTO sessions (token_hash, user_type, user_id, remember, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
		.bind(await sha256Hex(token), userType, userId, remember ? 1 : 0, new Date(now).toISOString(), expires.toISOString())
		.run();
	return { token, expires };
}

/** The student a session token belongs to, or null if it's unknown or expired. */
export async function studentForToken(db: D1Database, token: string | undefined, now = Date.now()): Promise<Student | null> {
	if (!token) return null;
	return db
		.prepare(
			`SELECT s.id, s.username, s.group_id
			 FROM sessions x JOIN students s ON s.id = x.user_id
			 WHERE x.token_hash = ? AND x.user_type = 'student' AND x.expires_at > ?`
		)
		.bind(await sha256Hex(token), new Date(now).toISOString())
		.first<Student>();
}

export async function endSession(db: D1Database, token: string | undefined) {
	if (!token) return;
	await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

/** Log a student out everywhere (used when a teacher resets their code). */
export async function endStudentSessions(db: D1Database, studentId: number) {
	await db.prepare("DELETE FROM sessions WHERE user_type = 'student' AND user_id = ?").bind(studentId).run();
}

// ---- Rate limiting ----------------------------------------------------------

const loginKey = async (ip: string) => `login:${await sha256Hex(ip)}`;
const WINDOW = LOGIN_BLOCK_MINUTES * 60 * 1000;

/** Ms until this IP may try again, or 0 if it isn't blocked. */
export async function loginBlockedFor(db: D1Database, ip: string, now = Date.now(), maxFailures = LOGIN_MAX_FAILURES): Promise<number> {
	const row = await db
		.prepare('SELECT count, window_start FROM rate_limits WHERE key = ?')
		.bind(await loginKey(ip))
		.first<{ count: number; window_start: number }>();
	if (!row || row.window_start <= now - WINDOW || row.count < maxFailures) return 0;
	return row.window_start + WINDOW - now;
}

/** Count one failed login. A window older than LOGIN_BLOCK_MINUTES starts again from 1. */
export async function recordLoginFailure(db: D1Database, ip: string, now = Date.now()) {
	await db
		.prepare(
			`INSERT INTO rate_limits (key, count, window_start) VALUES (?1, 1, ?2)
			 ON CONFLICT (key) DO UPDATE SET
			   count        = CASE WHEN rate_limits.window_start <= ?3 THEN 1  ELSE rate_limits.count + 1 END,
			   window_start = CASE WHEN rate_limits.window_start <= ?3 THEN ?2 ELSE rate_limits.window_start END`
		)
		.bind(await loginKey(ip), now, now - WINDOW)
		.run();
}

export type LoginResult =
	| { ok: true; student: Student; token: string; expires: Date }
	| { ok: false; status: 401 | 429; message: string };

export async function loginWithCode(
	db: D1Database,
	{ code, remember, ip, now = Date.now() }: { code: unknown; remember: boolean; ip: string; now?: number }
): Promise<LoginResult> {
	const blocked = await loginBlockedFor(db, ip, now);
	if (blocked > 0) {
		const minutes = Math.ceil(blocked / 60000);
		return { ok: false, status: 429, message: `Too many attempts from this network. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` };
	}

	const normalised = normaliseCode(code);
	const student = normalised
		? await db.prepare('SELECT id, username, group_id FROM students WHERE login_code = ?').bind(normalised).first<Student>()
		: null;
	if (!student) {
		await recordLoginFailure(db, ip, now);
		return { ok: false, status: 401, message: "That code wasn't recognised. Check it against your slip and try again." };
	}

	const { token, expires } = await createSession(db, student.id, remember, now);
	await db.prepare('UPDATE students SET last_active_at = ? WHERE id = ?').bind(new Date(now).toISOString(), student.id).run();
	return { ok: true, student, token, expires };
}

// ---- Cookies --------------------------------------------------------------------

/**
 * Without "Remember me" neither cookie has an expiry, so the browser deletes
 * them when it closes. Secure is SvelteKit's default (except on localhost).
 */
export function setLoginCookies(cookies: Cookies, token: string, username: string, remember: boolean, expires: Date) {
	const base = { path: '/', sameSite: 'lax' as const, ...(remember && { expires }) };
	cookies.set(SESSION_COOKIE, token, { ...base, httpOnly: true });
	cookies.set(NAME_COOKIE, username, { ...base, httpOnly: false }); // SvelteKit URI-encodes it
}

export function clearLoginCookies(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	cookies.delete(NAME_COOKIE, { path: '/' });
}
