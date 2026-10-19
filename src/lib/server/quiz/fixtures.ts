// Small quizzes for the tests.

import type { Question, Quiz } from './types';

export function question(id: string, concept: string, extra: Partial<Question> = {}): Question {
	return {
		id,
		type: 'single',
		status: 'reviewed',
		spec_point: '2.1.2.2',
		concept,
		command: 'identify',
		see: '/gcse/unit2/timber/#hardwoods',
		text: `Question ${id}?`,
		options: [{ text: 'Right' }, { text: 'Wrong A', why_wrong: 'Because A.' }, { text: 'Wrong B', why_wrong: 'Because B.' }],
		answer: 0,
		explanation: 'Right is right.',
		...extra
	};
}

/** A quiz with `n` questions, each on its own concept unless `concepts` says otherwise. */
export function quiz(n: number, extra: Partial<Quiz> = {}, concepts?: string[]): Quiz {
	return {
		id: 'test-quiz',
		spec: 'gcse-legacy',
		unit: '2.1.2',
		topic: 'Test topic',
		page: '/gcse/unit2/timber/',
		questions_per_attempt: 10,
		questions: Array.from({ length: n }, (_, i) => question(`q-${i + 1}`, concepts?.[i] ?? `concept-${i + 1}`)),
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
