import { describe, expect, it } from 'vitest';
import { hashPassword, isAllowedTeacher, normaliseEmail, passwordSignIn, peekSignInLink, requestSignInLink, teacherForToken, useSignInLink, verifyPassword, type Mailer } from './teachers';
import { testDb } from './testing/d1';

const now = Date.UTC(2026, 9, 19, 8);
const allowList = 'Ms.Jones@School.org , mr.patel@school.org';

function recorder() {
	const sent: { to: string; link: string }[] = [];
	const mailer: Mailer = { send: async (to, link) => (sent.push({ to, link }), true) };
	return { sent, mailer };
}

async function ask(db: D1Database, email: string, mailer: Mailer, extra: { ip?: string; at?: number } = {}) {
	return requestSignInLink(db, {
		email,
		remember: false,
		ip: extra.ip ?? '203.0.113.7',
		origin: 'https://pd.example',
		allowList,
		mailer,
		dev: false,
		now: extra.at ?? now
	});
}

const tokenOf = (link: string) => new URL(link).searchParams.get('token')!;

describe('teacher sign-in links', () => {
	it('checks the allow list, ignoring case and spaces', () => {
		expect(isAllowedTeacher('ms.jones@school.org', allowList)).toBe(true);
		expect(isAllowedTeacher('someone@school.org', allowList)).toBe(false);
		expect(isAllowedTeacher('ms.jones@school.org', undefined)).toBe(false);
		expect(normaliseEmail('  Ms.Jones@School.org ')).toBe('ms.jones@school.org');
		expect(normaliseEmail('not an email')).toBeNull();
	});

	it('emails a link to an allowed teacher, and gives the same reply to anyone else', async () => {
		const db = testDb();
		const { sent, mailer } = recorder();
		const allowed = await ask(db, 'MS.JONES@school.org', mailer);
		const other = await ask(db, 'stranger@example.com', mailer);
		expect(allowed).toEqual({ ok: true });
		expect(other).toEqual({ ok: true });
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({ to: 'ms.jones@school.org', link: expect.stringMatching(/^https:\/\/pd\.example\/teacher\/login\/verify\/\?token=/) });
	});

	it('stores only a hash of the link token', async () => {
		const db = testDb();
		const { sent, mailer } = recorder();
		await ask(db, 'ms.jones@school.org', mailer);
		const row = await db.prepare('SELECT token_hash FROM magic_links').first<{ token_hash: string }>();
		expect(row!.token_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(sent[0].link).not.toContain(row!.token_hash);
	});

	it("isn't spent by opening it (mail scanners), only by signing in", async () => {
		const db = testDb();
		const { sent, mailer } = recorder();
		await ask(db, 'ms.jones@school.org', mailer);
		const token = tokenOf(sent[0].link);
		expect(await peekSignInLink(db, token, now)).toEqual({ status: 'valid', email: 'ms.jones@school.org' });
		expect(await peekSignInLink(db, token, now)).toEqual({ status: 'valid', email: 'ms.jones@school.org' });
		const signedIn = await useSignInLink(db, token, allowList, now);
		expect(signedIn?.teacher.email).toBe('ms.jones@school.org');
		expect(await teacherForToken(db, signedIn!.sessionToken, now)).toMatchObject({ email: 'ms.jones@school.org' });
	});

	it('works only once', async () => {
		const db = testDb();
		const { sent, mailer } = recorder();
		await ask(db, 'ms.jones@school.org', mailer);
		const token = tokenOf(sent[0].link);
		expect(await useSignInLink(db, token, allowList, now)).not.toBeNull();
		expect(await useSignInLink(db, token, allowList, now)).toBeNull();
		expect(await peekSignInLink(db, token, now)).toEqual({ status: 'used' });
	});

	it('expires after 15 minutes', async () => {
		const db = testDb();
		const { sent, mailer } = recorder();
		await ask(db, 'ms.jones@school.org', mailer);
		const token = tokenOf(sent[0].link);
		const later = now + 15 * 60_000;
		expect(await peekSignInLink(db, token, later)).toEqual({ status: 'expired' });
		expect(await useSignInLink(db, token, allowList, later)).toBeNull();
	});

	it('refuses a link whose address was taken off the allow list since', async () => {
		const db = testDb();
		const { sent, mailer } = recorder();
		await ask(db, 'mr.patel@school.org', mailer);
		expect(await useSignInLink(db, tokenOf(sent[0].link), 'ms.jones@school.org', now)).toBeNull();
	});

	it('creates the teacher the first time, and reuses them after', async () => {
		const db = testDb();
		const { sent, mailer } = recorder();
		await ask(db, 'ms.jones@school.org', mailer);
		await ask(db, 'ms.jones@school.org', mailer);
		const a = await useSignInLink(db, tokenOf(sent[0].link), allowList, now);
		const b = await useSignInLink(db, tokenOf(sent[1].link), allowList, now);
		expect(a!.teacher.id).toBe(b!.teacher.id);
		expect((await db.prepare('SELECT COUNT(*) AS n FROM teachers').first<{ n: number }>())!.n).toBe(1);
	});

	it('limits how many links one address can be sent', async () => {
		const db = testDb();
		const { sent, mailer } = recorder();
		for (let i = 0; i < 3; i++) expect((await ask(db, 'ms.jones@school.org', mailer)).ok).toBe(true);
		expect(await ask(db, 'ms.jones@school.org', mailer)).toMatchObject({ ok: false, status: 429 });
		expect(sent).toHaveLength(3);
		expect((await ask(db, 'ms.jones@school.org', mailer, { at: now + 15 * 60_000 })).ok).toBe(true);
	});

	it('rejects junk', async () => {
		const db = testDb();
		const { mailer } = recorder();
		expect(await ask(db, 'nope', mailer)).toMatchObject({ ok: false, status: 400 });
		expect(await peekSignInLink(db, undefined, now)).toEqual({ status: 'unknown' });
		expect(await useSignInLink(db, 'made-up', allowList, now)).toBeNull();
	});
});

describe('teacher password sign-in', () => {
	const sign = (db: D1Database, password: string, passwordHash: string, extra: { email?: string; ip?: string; at?: number } = {}) =>
		passwordSignIn(db, {
			email: extra.email ?? 'ms.jones@school.org',
			password,
			remember: false,
			ip: extra.ip ?? '203.0.113.7',
			allowList,
			passwordHash,
			now: extra.at ?? now
		});

	it('stores only a salted hash, which verifies the right password and nothing else', async () => {
		const hash = await hashPassword('correct horse', 1000);
		expect(hash).toMatch(/^pbkdf2\$1000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
		expect(hash).not.toContain('correct');
		expect(await hashPassword('correct horse', 1000)).not.toBe(hash); // random salt
		expect(await verifyPassword('correct horse', hash)).toBe(true);
		expect(await verifyPassword('correct horsf', hash)).toBe(false);
		expect(await verifyPassword('', hash)).toBe(false);
		expect(await verifyPassword('correct horse', undefined)).toBe(false);
		expect(await verifyPassword('correct horse', 'nonsense')).toBe(false);
	});

	it('signs in an allowed address with the right password', async () => {
		const db = testDb();
		const r = await sign(db, 'pw', await hashPassword('pw', 1000));
		expect(r.ok).toBe(true);
		if (r.ok) expect(await teacherForToken(db, r.sessionToken, now)).toMatchObject({ email: 'ms.jones@school.org' });
	});

	it('gives the same answer for a wrong password and an unknown address', async () => {
		const db = testDb();
		const hash = await hashPassword('pw', 1000);
		const wrongPassword = await sign(db, 'nope', hash);
		const wrongEmail = await sign(db, 'pw', hash, { email: 'stranger@example.com' });
		expect(wrongPassword).toEqual(wrongEmail);
		expect(wrongPassword).toMatchObject({ ok: false, status: 401 });
	});

	it('blocks an IP address after 10 failures for 15 minutes, even with the right password', async () => {
		const db = testDb();
		const hash = await hashPassword('pw', 1000);
		for (let i = 0; i < 10; i++) await sign(db, 'guess', hash);
		expect(await sign(db, 'pw', hash)).toMatchObject({ ok: false, status: 429 });
		expect((await sign(db, 'pw', hash, { ip: '198.51.100.9' })).ok).toBe(true);
		expect((await sign(db, 'pw', hash, { at: now + 15 * 60_000 })).ok).toBe(true);
	});
});

describe('scripts/set-teacher-password.mjs', () => {
	it('makes hashes the site can verify', async () => {
		const script = await import('../../../scripts/set-teacher-password.mjs');
		const password = script.generatePassword();
		expect(password).toMatch(/^([A-HJKMNP-Z2-9]{5}-){4}[A-HJKMNP-Z2-9]{5}$/);
		expect(await verifyPassword(password, script.hashPassword(password, 1000))).toBe(true);
		expect(await verifyPassword(password + 'x', script.hashPassword(password, 1000))).toBe(false);
	});
});
