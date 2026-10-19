// The quiz bank, answers included, as built by vite-plugin.ts. Server-only.

import bank from 'virtual:quiz-bank';
import type { Quiz } from './types';

export const quizzes: readonly Quiz[] = bank.quizzes;

export function getQuiz(id: string): Quiz | undefined {
	return quizzes.find((q) => q.id === id);
}

/** The id of the quiz shown on a topic page, if it has one. */
export function quizIdForPage(page: string): string | null {
	return quizzes.find((q) => q.page === page)?.id ?? null;
}
