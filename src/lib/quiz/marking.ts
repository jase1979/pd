// Automatic marking for every question type. Shared by the server, which
// marks submitted attempts, and the browser, which marks "Try the ones you got
// wrong again now" once the answers have already been revealed.
//
// Confidence never affects the mark, and "I don't know" scores 0, exactly the
// same as a wrong answer, so neither is ever worth gaming.

import type { Chosen, QuestionType } from './public';

export interface Mark {
	marks: number;
	max_marks: number;
	/** True only for full marks. */
	correct: boolean;
}

/** The most marks a question can earn. */
export function maxMarks(type: QuestionType, answer: Chosen): number {
	if (type === 'multi') return (answer as number[]).length; // 1 per correct option
	if (type === 'two_tier') return 2; // answer + reason
	return 1;
}

/**
 * Mark one answer. `chosen` must already have the right shape for the type
 * (see answerShapeError); null means "I don't know".
 */
export function mark(type: QuestionType, answer: Chosen, chosen: Chosen | null): Mark {
	const max_marks = maxMarks(type, answer);
	let marks = 0;
	if (chosen !== null) {
		if (type === 'multi') {
			// 1 mark for each correct option chosen.
			const right = new Set(answer as number[]);
			marks = (chosen as number[]).filter((i) => right.has(i)).length;
		} else if (type === 'two_tier') {
			// The reason only earns its mark if the answer is also correct.
			const a = answer as { answer: number; reason: number };
			const c = chosen as { answer: number; reason: number };
			if (c.answer === a.answer) marks = c.reason === a.reason ? 2 : 1;
		} else {
			marks = chosen === answer ? 1 : 0;
		}
	}
	return { marks, max_marks, correct: marks === max_marks };
}

/**
 * Why `chosen` isn't a valid answer to this question, or null if it is.
 * Used by the server to reject malformed submissions.
 */
export function answerShapeError(
	type: QuestionType,
	answer: Chosen,
	optionCount: number,
	reasonCount: number,
	chosen: unknown
): string | null {
	const isIndex = (v: unknown, n: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;
	if (type === 'multi') {
		const need = (answer as number[]).length;
		if (!Array.isArray(chosen) || !chosen.every((i) => isIndex(i, optionCount))) {
			return 'should be a list of option numbers';
		}
		if (new Set(chosen).size !== chosen.length) return 'chooses the same option twice';
		if (chosen.length !== need) return `should choose exactly ${need} options`;
		return null;
	}
	if (type === 'two_tier') {
		const c = chosen as { answer?: unknown; reason?: unknown } | null;
		if (typeof c !== 'object' || c === null || !isIndex(c.answer, optionCount) || !isIndex(c.reason, reasonCount)) {
			return 'should choose an answer and a reason';
		}
		return null;
	}
	return isIndex(chosen, optionCount) ? null : 'should be the number of an option';
}
