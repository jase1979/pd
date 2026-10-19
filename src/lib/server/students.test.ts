import { describe, expect, it } from 'vitest';
import { createSession, endSession, endStudentSessions, loginBlockedFor, loginWithCode, studentForToken } from './students';
import { LOGIN_MAX_FAILURES } from './config';
import { seedStudents, testDb } from './testing/d1';

const now = Date.UTC(2026, 9, 19, 9);
const HOUR = 3600_000;
const SCHOOL_IP = '203.0.113.7';

async function setup() {
	const db = testDb();
	const [id] = await seedStudents(db, ['amy']);
	const code = (await db.prepare('SELECT login_code FROM students WHERE id = ?').bind(id).first<{ login_code: string }>())!.login_code;
	return { db, id, code };
}

describe('loginWithCode', () => {
	it('logs in with the code, any case, with or without the dash', async () => {
		const { db, code } = await setup();
		for (const typed of [code, code.toLowerCase(), `${code.slice(0, 4)}-${code.slice(4)}`]) {
			const r = await loginWithCode(db, { code: typed, remember: false, ip: SCHOOL_IP, now });
			expect(r.ok && r.student.username).toBe('amy');
		}
	});

	it('rejects an unknown code', async () => {
		const { db } = await setup();
		const r = await loginWithCode(db, { code: 'ZZZZ-ZZZZ', remember: false, ip: SCHOOL_IP, now });
		expect(r).toMatchObject({ ok: false, status: 401 });
	});

	it('stores only a hash of the session token', async () => {
		const { db, code } = await setup();
		const r = await loginWithCode(db, { code, remember: false, ip: SCHOOL_IP, now });
		if (!r.ok) throw new Error('login failed');
		const row = await db.prepare('SELECT token_hash FROM sessions').first<{ token_hash: string }>();
		expect(row!.token_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(row!.token_hash).not.toContain(r.token);
	});
});

describe('session expiry', () => {
	it('lasts 12 hours without "Remember me"', async () => {
		const { db, id } = await setup();
		const { token } = await createSession(db, id, false, now);
		expect(await studentForToken(db, token, now + 11 * HOUR)).toMatchObject({ username: 'amy' });
		expect(await studentForToken(db, token, now + 12 * HOUR)).toBeNull();
	});

	it('lasts 7 days with "Remember me"', async () => {
		const { db, id } = await setup();
		const { token } = await createSession(db, id, true, now);
		expect(await studentForToken(db, token, now + 6 * 24 * HOUR)).not.toBeNull();
		expect(await studentForToken(db, token, now + 7 * 24 * HOUR)).toBeNull();
	});

	it('ends on logout, and when the teacher resets the code', async () => {
		const { db, id } = await setup();
		const a = await createSession(db, id, false, now);
		const b = await createSession(db, id, true, now);
		await endSession(db, a.token);
		expect(await studentForToken(db, a.token, now)).toBeNull();
		expect(await studentForToken(db, b.token, now)).not.toBeNull();
		await endStudentSessions(db, id);
		expect(await studentForToken(db, b.token, now)).toBeNull();
	});

	it('ignores unknown tokens', async () => {
		const { db } = await setup();
		expect(await studentForToken(db, 'nonsense', now)).toBeNull();
		expect(await studentForToken(db, undefined, now)).toBeNull();
	});
});

describe('login rate limit', () => {
	it("doesn't lock out a class making ordinary typing mistakes", async () => {
		const { db, code } = await setup();
		// 30 students on one school IP, each mistyping their code 3 times: 90 failures.
		for (let i = 0; i < 90; i++) await loginWithCode(db, { code: 'ZZZZ-ZZZZ', remember: false, ip: SCHOOL_IP, now: now + i * 1000 });
		const r = await loginWithCode(db, { code, remember: false, ip: SCHOOL_IP, now: now + 100_000 });
		expect(r.ok).toBe(true);
	});

	it('blocks sustained guessing for 15 minutes', async () => {
		const { db, code } = await setup();
		for (let i = 0; i < LOGIN_MAX_FAILURES; i++) await loginWithCode(db, { code: 'ZZZZ-ZZZZ', remember: false, ip: SCHOOL_IP, now });
		// Even the right code is refused while blocked, so guessing can't continue.
		expect(await loginWithCode(db, { code, remember: false, ip: SCHOOL_IP, now: now + 1000 })).toMatchObject({ ok: false, status: 429 });
		// Another network is unaffected.
		expect((await loginWithCode(db, { code, remember: false, ip: '198.51.100.1', now })).ok).toBe(true);
		// After the window, the school can log in again.
		expect((await loginWithCode(db, { code, remember: false, ip: SCHOOL_IP, now: now + 15 * 60_000 })).ok).toBe(true);
	});

	it('never counts successful logins', async () => {
		const { db, code } = await setup();
		for (let i = 0; i < LOGIN_MAX_FAILURES + 20; i++) await loginWithCode(db, { code, remember: false, ip: SCHOOL_IP, now });
		expect(await loginBlockedFor(db, SCHOOL_IP, now)).toBe(0);
	});

	it("doesn't store IP addresses", async () => {
		const { db } = await setup();
		await loginWithCode(db, { code: 'ZZZZ-ZZZZ', remember: false, ip: SCHOOL_IP, now });
		const { results } = await db.prepare('SELECT key FROM rate_limits').all<{ key: string }>();
		expect(results[0].key).toMatch(/^login:[0-9a-f]{64}$/);
	});
});
