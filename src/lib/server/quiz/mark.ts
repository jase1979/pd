// Automatic marking. Every question is multiple choice, so marking is a
// comparison with the answer tagged in the YAML.
//
// Confidence never affects the mark, and "I don't know" scores 0, exactly the
// same as a wrong answer, so neither is ever worth gaming.

import type { Question } from './types';

export interface SubmittedAnswer {
	question_id: string;
	/** Original option index (before the browser shuffled them), or null for "I don't know". */
	chosen: number | null;
	dont_know: boolean;
	/** null for "I don't know", which doesn't ask for a rating. */
	confidence: 'sure' | 'guess' | null;
}

export interface Mark {
	marks: number;
	max_marks: number;
	/** True only for full marks. */
	correct: boolean;
}

export function markAnswer(question: Question, answer: SubmittedAnswer): Mark {
	const max_marks = 1;
	const marks = !answer.dont_know && answer.chosen === question.answer ? 1 : 0;
	return { marks, max_marks, correct: marks === max_marks };
}
