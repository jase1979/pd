// Small quizzes for the tests.

import type { ExamSkillQuestion, MultiQuestion, Question, Quiz, SingleQuestion, TwoTierQuestion } from './types';

const base = (id: string, concept: string) => ({
	id,
	status: 'reviewed' as const,
	spec_point: '2.1.2.2',
	concept,
	command: 'identify',
	see: '/gcse/unit2/timber/#hardwoods',
	text: `Question ${id}?`,
	explanation: 'Right is right.'
});

const threeOptions = () => [
	{ text: 'Right' },
	{ text: 'Wrong A', why_wrong: 'Because A.' },
	{ text: 'Wrong B', why_wrong: 'Because B.' }
];

/** A single-answer question; option 0 is correct. */
export function question(id: string, concept: string, extra: Partial<SingleQuestion> = {}): SingleQuestion {
	return { ...base(id, concept), type: 'single', options: threeOptions(), answer: 0, ...extra };
}

/** "Select TWO": options 0 and 1 are correct. */
export function multi(id: string, concept: string): MultiQuestion {
	return {
		...base(id, concept),
		type: 'multi',
		options: [{ text: 'Right 1' }, { text: 'Right 2' }, { text: 'Wrong A', why_wrong: 'Because A.' }, { text: 'Wrong B', why_wrong: 'Because B.' }],
		answer: [0, 1]
	};
}

/** Answer option 0, reason option 0. */
export function twoTier(id: string, concept: string): TwoTierQuestion {
	return {
		...base(id, concept),
		type: 'two_tier',
		command: 'explain',
		options: threeOptions(),
		answer: 0,
		reason: {
			text: 'Why?',
			options: [{ text: 'Good reason' }, { text: 'Bad reason', why_wrong: 'Not a reason.' }],
			answer: 0
		}
	};
}

/** best_answer: sample 2 (2 marks) is correct. */
export function bestAnswer(id: string, concept: string, extra: Partial<ExamSkillQuestion> = {}): ExamSkillQuestion {
	return {
		...base(id, concept),
		type: 'exam_skill',
		format: 'best_answer',
		command: 'explain',
		exam_question: { text: 'Explain why.', marks: 2 },
		options: [
			{ text: 'Weak', marks_awarded: 0, why_wrong: 'No reason given.' },
			{ text: 'Half', marks_awarded: 1, why_wrong: 'Not linked to the product.' },
			{ text: 'Full', marks_awarded: 2 }
		],
		answer: 2,
		...extra
	};
}

/** A quiz with `n` single questions, each on its own concept unless `concepts` says otherwise. */
export function quiz(n: number, extra: Partial<Quiz> = {}, concepts?: string[]): Quiz {
	return {
		id: 'test-quiz',
		spec: 'gcse-legacy',
		unit: '2.1.2',
		topic: 'Test topic',
		page: '/gcse/unit2/timber/',
		questions_per_attempt: 10,
		exam_skills_per_attempt: 2,
		past_papers: [],
		scenarios: [],
		questions: Array.from({ length: n }, (_, i): Question => question(`q-${i + 1}`, concepts?.[i] ?? `concept-${i + 1}`)),
		...extra
	};
}

/** A repeatable stand-in for Math.random. */
export function seeded(seed = 1): () => number {
	let s = seed;
	return () => {
		s = (s * 16807) % 2147483647;
		return (s - 1) / 2147483646;
	};
}
