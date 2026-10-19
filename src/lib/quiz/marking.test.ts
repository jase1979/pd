import { describe, expect, it } from 'vitest';
import { answerShapeError, mark, maxMarks } from './marking';
import type { Chosen, QuestionType } from './public';

describe('mark: single and exam_skill', () => {
	for (const type of ['single', 'exam_skill'] as const) {
		it(`${type}: 1 mark for the correct option, 0 otherwise`, () => {
			expect(mark(type, 2, 2)).toEqual({ marks: 1, max_marks: 1, correct: true });
			expect(mark(type, 2, 0)).toEqual({ marks: 0, max_marks: 1, correct: false });
		});
	}

	it('scores "I don\'t know" the same as a wrong answer', () => {
		expect(mark('single', 0, null)).toEqual(mark('single', 0, 1));
	});
});

describe('mark: multi', () => {
	it('gives 1 mark for each correct option chosen', () => {
		expect(mark('multi', [0, 2], [0, 2])).toEqual({ marks: 2, max_marks: 2, correct: true });
		expect(mark('multi', [0, 2], [2, 0])).toMatchObject({ marks: 2, correct: true });
		expect(mark('multi', [0, 2], [0, 1])).toEqual({ marks: 1, max_marks: 2, correct: false });
		expect(mark('multi', [0, 2], [1, 3])).toMatchObject({ marks: 0 });
	});

	it('has as many marks as correct options', () => {
		expect(maxMarks('multi', [0, 1, 3])).toBe(3);
	});

	it('gives 0 for "I don\'t know"', () => {
		expect(mark('multi', [0, 2], null)).toEqual({ marks: 0, max_marks: 2, correct: false });
	});
});

describe('mark: two_tier', () => {
	const key = { answer: 1, reason: 0 };

	it('gives 2 marks for the right answer and reason', () => {
		expect(mark('two_tier', key, { answer: 1, reason: 0 })).toEqual({ marks: 2, max_marks: 2, correct: true });
	});

	it('gives 1 mark for the right answer with the wrong reason', () => {
		expect(mark('two_tier', key, { answer: 1, reason: 2 })).toEqual({ marks: 1, max_marks: 2, correct: false });
	});

	it('gives no reason mark unless the answer is also correct', () => {
		expect(mark('two_tier', key, { answer: 0, reason: 0 })).toMatchObject({ marks: 0 });
	});

	it('gives 0 for "I don\'t know"', () => {
		expect(mark('two_tier', key, null)).toMatchObject({ marks: 0, max_marks: 2 });
	});
});

describe('answerShapeError', () => {
	it('accepts well-formed answers', () => {
		expect(answerShapeError('single', 0, 4, 0, 3)).toBeNull();
		expect(answerShapeError('multi', [0, 1], 4, 0, [3, 1])).toBeNull();
		expect(answerShapeError('two_tier', { answer: 0, reason: 0 }, 3, 2, { answer: 2, reason: 1 })).toBeNull();
	});

	it.each([
		['single', 0, 4, 0, 4, /option/],
		['single', 0, 4, 0, '1', /option/],
		['single', 0, 4, 0, [1], /option/],
		['multi', [0, 1], 4, 0, 1, /list/],
		['multi', [0, 1], 4, 0, [0], /exactly 2/],
		['multi', [0, 1], 4, 0, [0, 1, 2], /exactly 2/],
		['multi', [0, 1], 4, 0, [1, 1], /twice/],
		['multi', [0, 1], 4, 0, [0, 9], /list/],
		['two_tier', { answer: 0, reason: 0 }, 3, 2, 1, /answer and a reason/],
		['two_tier', { answer: 0, reason: 0 }, 3, 2, { answer: 0 }, /answer and a reason/],
		['two_tier', { answer: 0, reason: 0 }, 3, 2, { answer: 0, reason: 2 }, /answer and a reason/]
	] as [QuestionType, Chosen, number, number, unknown, RegExp][])('rejects %s answer %j → %j', (type, key, options, reasons, chosen, pattern) => {
		expect(answerShapeError(type, key, options, reasons, chosen)).toMatch(pattern);
	});
});
