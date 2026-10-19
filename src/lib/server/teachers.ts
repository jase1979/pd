// Teacher sign-in, by a link emailed to them. There are no teacher passwords.
//
// - Only addresses in TEACHER_EMAILS can sign in. Anyone else gets the same
//   "check your email" reply but no email, so the form doesn't reveal who is
//   on the list.
// - Opening the link shows a "Sign in" button and spends nothing. School mail
//   systems open links to scan them, which would otherwise use the link up
//   before the teacher clicks it.
// - A link works once, for MAGIC_LINK_MINUTES. Only its hash is stored.
// - The first time an allowed address signs in, its teachers row is created.
// - Sessions are the same as students' (see students.ts), with user_type
//   'teacher' and their own cookie.

import type { Cookies } from '@sveltejs/kit';
import {
	LINK_LIMIT_MINUTES,
	LINK_LIMIT_PER_EMAIL,
	LINK_LIMIT_PER_IP,
	MAGIC_LINK_MINUTES
} from './config';
import { hitRateLimit } from './ratelimit';
import { createSession, newToken, sha256Hex } from './students';

export const TEACHER_COOKIE = 'pd_teacher';

export interface Teacher {
	id: number;
	email: string;
}

export function normaliseEmail(input: unknown): string | null {
	if (typeof input !== 'string') return null;
	const email = input.trim().toLowerCase();
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

/** Is this address allowed to sign in? TEACHER_EMAILS is comma-separated. */
export function isAllowedTeacher(email: string, allowList: string | undefined): boolean {
	return (allowList ?? '')
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean)
		.includes(email);
}

export interface Mailer {
	/** Send the sign-in email; resolves false if it couldn't be sent. */
	send(to: string, link: string): Promise<boolean>;
}

export type LinkRequestResult = { ok: true; devLink?: string } | { ok: false; status: 400 | 429; message: string };

/**
 * Handle "email me a sign-in link". The reply is the same whether or not the
 * address is allowed. `devLink` is only returned in local development.
 */
export async function requestSignInLink(
	db: D1Database,
	{
		email: raw,
		remember,
		ip,
		origin,
		allowList,
		mailer,
		dev,
		now = Date.now()
	}: { email: unknown; remember: boolean; ip: string; origin: string; allowList: string | undefined; mailer: Mailer; dev: boolean; now?: number }
): Promise<LinkRequestResult> {
	const email = normaliseEmail(raw);
	if (!email) return { ok: false, status: 400, message: 'Please enter a valid email address.' };

	const window = LINK_LIMIT_MINUTES * 60_000;
	const ipOk = await hitRateLimit(db, 'link-ip', ip, LINK_LIMIT_PER_IP, window, now);
	const emailOk = await hitRateLimit(db, 'link-email', email, LINK_LIMIT_PER_EMAIL, window, now);
	if (!ipOk || !emailOk) {
		return { ok: false, status: 429, message: `Too many sign-in emails. Please wait ${LINK_LIMIT_MINUTES} minutes and try again.` };
	}

	if (!isAllowedTeacher(email, allowList)) return { ok: true };

	const token = newToken();
	await db
		.prepare('INSERT INTO magic_links (token_hash, email, remember, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
		.bind(await sha256Hex(token), email, remember ? 1 : 0, new Date(now).toISOString(), new Date(now + MAGIC_LINK_MINUTES * 60_000).toISOString())
		.run();
	const link = `${origin}/teacher/login/verify/?token=${encodeURIComponent(token)}`;
	await mailer.send(email, link);
	return dev ? { ok: true, devLink: link } : { ok: true };
}

export type LinkStatus = { status: 'valid'; email: string } | { status: 'used' | 'expired' | 'unknown' };

/** What a link would do, without spending it (for the "Sign in" page). */
export async function peekSignInLink(db: D1Database, token: unknown, now = Date.now()): Promise<LinkStatus> {
	if (typeof token !== 'string' || !token) return { status: 'unknown' };
	const row = await db
		.prepare('SELECT email, expires_at, consumed_at FROM magic_links WHERE token_hash = ?')
		.bind(await sha256Hex(token))
		.first<{ email: string; expires_at: string; consumed_at: string | null }>();
	if (!row) return { status: 'unknown' };
	if (row.consumed_at) return { status: 'used' };
	if (Date.parse(row.expires_at) <= now) return { status: 'expired' };
	return { status: 'valid', email: row.email };
}

/**
 * Spend a link and start a session. The UPDATE only matches an unspent,
 * unexpired link, so two clicks can't both sign in. The address is checked
 * against the allow list again, in case it was removed since the email went.
 */
export async function useSignInLink(db: D1Database, token: unknown, allowList: string | undefined, now = Date.now()) {
	if (typeof token !== 'string' || !token) return null;
	const at = new Date(now).toISOString();
	const claim = await db
		.prepare('UPDATE magic_links SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ? RETURNING email, remember')
		.bind(at, await sha256Hex(token), at)
		.first<{ email: string; remember: number }>();
	if (!claim || !isAllowedTeacher(claim.email, allowList)) return null;
	const teacher = await teacherByEmail(db, claim.email, now);
	const remember = claim.remember === 1;
	const { token: sessionToken, expires } = await createSession(db, teacher.id, remember, now, 'teacher');
	return { teacher, sessionToken, expires, remember };
}

/** The teachers row for an address, created the first time it signs in. */
export async function teacherByEmail(db: D1Database, email: string, now = Date.now()): Promise<Teacher> {
	await db
		.prepare('INSERT INTO teachers (email, created_at) VALUES (?, ?) ON CONFLICT (email) DO NOTHING')
		.bind(email, new Date(now).toISOString())
		.run();
	return (await db.prepare('SELECT id, email FROM teachers WHERE email = ?').bind(email).first<Teacher>())!;
}

export async function teacherForToken(db: D1Database, token: string | undefined, now = Date.now()): Promise<Teacher | null> {
	if (!token) return null;
	return db
		.prepare(
			`SELECT t.id, t.email FROM sessions x JOIN teachers t ON t.id = x.user_id
			 WHERE x.token_hash = ? AND x.user_type = 'teacher' AND x.expires_at > ?`
		)
		.bind(await sha256Hex(token), new Date(now).toISOString())
		.first<Teacher>();
}

export function setTeacherCookie(cookies: Cookies, token: string, remember: boolean, expires: Date) {
	cookies.set(TEACHER_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', ...(remember && { expires }) });
}

// ---- Email -------------------------------------------------------------------------

/**
 * Sends sign-in links through Resend. With no API key (local development)
 * the link is printed to the console instead. Plain, transactional email: no
 * open or click tracking, so the link in it is the real one.
 */
export function resendMailer(apiKey: string | undefined, from: string | undefined): Mailer {
	return {
		async send(to, link) {
			if (!apiKey || !from) {
				console.log(`\n=== Teacher sign-in link for ${to} (no RESEND_API_KEY, so not emailed) ===\n${link}\n`);
				return false;
			}
			const text = [
				'Here is your link to sign in to the WJEC Product Design revision site as a teacher:',
				'',
				link,
				'',
				`It works once, for the next ${MAGIC_LINK_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`
			].join('\n');
			const html = `<p>Here is your link to sign in to the WJEC Product Design revision site as a teacher:</p>
<p><a href="${link}">Sign in</a></p>
<p>It works once, for the next ${MAGIC_LINK_MINUTES} minutes. If you didn't ask for it, you can ignore this email.</p>`;
			const res = await fetch('https://api.resend.com/emails', {
				method: 'POST',
				headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
				body: JSON.stringify({ from, to: [to], subject: 'Your sign-in link', text, html })
			}).catch((e) => {
				console.error('Resend request failed', e);
				return null;
			});
			if (!res?.ok) {
				console.error('Resend refused the sign-in email', res?.status, await res?.text().catch(() => ''));
				return false;
			}
			return true;
		}
	};
}
