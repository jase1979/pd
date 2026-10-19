import { describe, expect, it } from 'vitest';
import { markAnswer } from './mark';
import { question } from './fixtures';

const q = question('q-1', 'c'); // answer 0

describe('markAnswer (single)', () => {
	it('gives 1 mark for the correct option', () => {
		expect(markAnswer(q, { question_id: 'q-1', chosen: 0, dont_know: false, confidence: 'sure' })).toEqual({
			marks: 1,
			max_marks: 1,
			correct: true
		});
	});

	it('gives 0 for a wrong option', () => {
		expect(markAnswer(q, { question_id: 'q-1', chosen: 2, dont_know: false, confidence: 'sure' }).marks).toBe(0);
	});

	it('scores "I don\'t know" the same as a wrong answer', () => {
		const dontKnow = markAnswer(q, { question_id: 'q-1', chosen: null, dont_know: true, confidence: null });
		const wrong = markAnswer(q, { question_id: 'q-1', chosen: 1, dont_know: false, confidence: 'guess' });
		expect(dontKnow).toEqual(wrong);
	});

	it('ignores confidence', () => {
		const sure = markAnswer(q, { question_id: 'q-1', chosen: 0, dont_know: false, confidence: 'sure' });
		const guess = markAnswer(q, { question_id: 'q-1', chosen: 0, dont_know: false, confidence: 'guess' });
		expect(guess).toEqual(sure);
	});
});
