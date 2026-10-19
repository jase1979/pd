import { describe, expect, it } from 'vitest';
import { attemptSize, groupByScenario, selectRandom } from './select';
import { bestAnswer, question, quiz, seeded } from './fixtures';
import type { Question } from './types';

describe('selectRandom', () => {
	it('picks up to questions_per_attempt knowledge questions', () => {
		expect(selectRandom(quiz(20).questions, 10, 2, seeded())).toHaveLength(10);
	});

	it('never picks two questions with the same concept', () => {
		// 12 questions but only 6 concepts, each shared by a pair.
		const concepts = Array.from({ length: 12 }, (_, i) => `c-${i % 6}`);
		const pool = quiz(12, {}, concepts).questions;
		for (let seed = 1; seed <= 50; seed++) {
			const picked = selectRandom(pool, 10, 2, seeded(seed));
			expect(picked).toHaveLength(6); // shorter rather than breaking the rule
			expect(new Set(picked.map((q) => q.concept)).size).toBe(picked.length);
		}
	});

	it('varies between attempts', () => {
		const pool = quiz(20).questions;
		const a = selectRandom(pool, 5, 0, seeded(1)).map((q) => q.id);
		const b = selectRandom(pool, 5, 0, seeded(2)).map((q) => q.id);
		expect(a).not.toEqual(b);
	});

	it('adds up to exam_skills_per_attempt exam_skill questions, after the knowledge questions', () => {
		const skills = [1, 2, 3, 4].map((i) => bestAnswer(`s-${i}`, `skill-${i}`));
		const pool = [...quiz(8).questions, ...skills];
		for (let seed = 1; seed <= 20; seed++) {
			const picked = selectRandom(pool, 6, 2, seeded(seed));
			expect(picked.map((q) => q.type)).toEqual([...Array(6).fill('single'), 'exam_skill', 'exam_skill']);
		}
	});
});

describe('groupByScenario', () => {
	it('puts questions sharing a scenario next to each other, keeping the order otherwise', () => {
		const q = (id: string, scenario?: string): Question => question(id, id, scenario ? { scenario } : {});
		const order = groupByScenario([q('a', 'bench'), q('b'), q('c', 'cabinet'), q('d', 'bench'), q('e', 'cabinet')]);
		expect(order.map((x) => x.id)).toEqual(['a', 'd', 'b', 'c', 'e']);
	});
});

describe('attemptSize', () => {
	it('is the target when there are enough concepts', () => {
		expect(attemptSize(quiz(20).questions, 10, 2)).toEqual({ knowledge: 10, exam_skill: 0 });
	});

	it('is limited by the number of concepts, not questions', () => {
		const pool = quiz(8, {}, ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'e']).questions;
		expect(attemptSize(pool, 10, 2).knowledge).toBe(5);
	});

	it('counts exam_skill questions separately', () => {
		const pool = [...quiz(6).questions, bestAnswer('s-1', 'skill-1'), bestAnswer('s-2', 'skill-1')];
		expect(attemptSize(pool, 10, 2)).toEqual({ knowledge: 6, exam_skill: 1 });
	});
});
