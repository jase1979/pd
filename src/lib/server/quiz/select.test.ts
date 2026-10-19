import { describe, expect, it } from 'vitest';
import { attemptSize, selectRandom } from './select';
import { quiz, seeded } from './fixtures';

describe('selectRandom', () => {
	it('picks up to n questions', () => {
		expect(selectRandom(quiz(20).questions, 10, seeded())).toHaveLength(10);
	});

	it('never picks two questions with the same concept', () => {
		// 12 questions but only 6 concepts, each shared by a pair.
		const concepts = Array.from({ length: 12 }, (_, i) => `c-${i % 6}`);
		const pool = quiz(12, {}, concepts).questions;
		for (let seed = 1; seed <= 50; seed++) {
			const picked = selectRandom(pool, 10, seeded(seed));
			expect(picked).toHaveLength(6); // shorter rather than breaking the rule
			expect(new Set(picked.map((q) => q.concept)).size).toBe(picked.length);
		}
	});

	it('varies between attempts', () => {
		const pool = quiz(20).questions;
		const a = selectRandom(pool, 5, seeded(1)).map((q) => q.id);
		const b = selectRandom(pool, 5, seeded(2)).map((q) => q.id);
		expect(a).not.toEqual(b);
	});
});

describe('attemptSize', () => {
	it('is the target when there are enough concepts', () => {
		expect(attemptSize(quiz(20).questions, 10)).toBe(10);
	});

	it('is limited by the number of concepts, not questions', () => {
		const pool = quiz(8, {}, ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'e']).questions;
		expect(attemptSize(pool, 10)).toBe(5);
	});
});
