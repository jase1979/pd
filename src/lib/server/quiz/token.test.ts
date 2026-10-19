import { describe, expect, it } from 'vitest';
import { signToken, verifyToken, type AttemptToken } from './token';

const secret = 'test-secret';
const now = Date.UTC(2026, 9, 19, 12);
const payload: AttemptToken = { v: 2, mode: 'topic', quiz_id: 'legacy-u2-timber', q: ['timber-001', 'timber-003'], exp: now + 60_000 };

describe('attempt tokens', () => {
	it('round-trips a valid token', async () => {
		const token = await signToken(payload, secret);
		expect(await verifyToken(token, secret, now)).toEqual(payload);
	});

	it('rejects a token whose payload was edited', async () => {
		const token = await signToken(payload, secret);
		const [, sig] = token.split('.');
		const forged = btoa(JSON.stringify({ ...payload, q: ['timber-002'] }))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
		expect(await verifyToken(`${forged}.${sig}`, secret, now)).toBeNull();
	});

	it('rejects a token whose signature was edited', async () => {
		const token = await signToken(payload, secret);
		const last = token.at(-1) === 'A' ? 'B' : 'A';
		expect(await verifyToken(token.slice(0, -1) + last, secret, now)).toBeNull();
	});

	it('rejects a token signed with a different secret', async () => {
		const token = await signToken(payload, 'another-secret');
		expect(await verifyToken(token, secret, now)).toBeNull();
	});

	it('rejects an expired token', async () => {
		const token = await signToken(payload, secret);
		expect(await verifyToken(token, secret, payload.exp)).toBeNull();
		expect(await verifyToken(token, secret, payload.exp - 1)).not.toBeNull();
	});

	it('rejects junk', async () => {
		for (const junk of [undefined, 42, '', 'abc', 'a.b.c', '!!!.???']) {
			expect(await verifyToken(junk, secret, now)).toBeNull();
		}
	});
});
