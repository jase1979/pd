import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, formatCode, generateCode, normaliseCode, uniqueCode } from './codes';
import { testDb } from './testing/d1';

describe('login codes', () => {
	it('are 8 characters from the alphabet', () => {
		for (let i = 0; i < 500; i++) {
			const code = generateCode();
			expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
		}
	});

	it('never use the easily confused characters 0, O, 1, I or L', () => {
		for (const c of '0O1IL') expect(CODE_ALPHABET).not.toContain(c);
		expect(CODE_ALPHABET).toHaveLength(31);
	});

	it('use every character of the alphabet (no bias towards some)', () => {
		const counts = new Map<string, number>();
		for (let i = 0; i < 4000; i++) for (const c of generateCode()) counts.set(c, (counts.get(c) ?? 0) + 1);
		expect(counts.size).toBe(31);
		// 32,000 characters / 31 ≈ 1032 each; anything wildly off means a biased generator.
		for (const n of counts.values()) expect(n).toBeGreaterThan(850);
	});

	it('are displayed as XXXX-XXXX', () => {
		expect(formatCode('K7MPQ2XA')).toBe('K7MP-Q2XA');
	});

	it.each([
		['K7MP-Q2XA', 'K7MPQ2XA'],
		['k7mp-q2xa', 'K7MPQ2XA'],
		['K7MPQ2XA', 'K7MPQ2XA'],
		['  k7mp q2xa ', 'K7MPQ2XA']
	])('normalise %j (case and dash) to %j', (input, expected) => {
		expect(normaliseCode(input)).toBe(expected);
	});

	it.each([['K7MP-Q2X'], ['K7MP-Q2XAB'], ['K7MP-Q2X0'], ['K7MP-Q2XI'], [''], [42], [null]])('reject %j', (input) => {
		expect(normaliseCode(input)).toBeNull();
	});

	it('are unique among existing students', async () => {
		const db = testDb();
		await db.prepare("INSERT INTO teaching_groups (id, name) VALUES (1, 'G')").run();
		const seen = new Set<string>();
		for (let i = 0; i < 50; i++) {
			const code = await uniqueCode(db);
			expect(seen.has(code)).toBe(false);
			seen.add(code);
			await db.prepare('INSERT INTO students (group_id, username, login_code) VALUES (1, ?, ?)').bind(`s${i}`, code).run();
		}
	});
});
