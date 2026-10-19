// The quiz bank, built from content/quizzes/ by src/lib/server/quiz/vite-plugin.ts.
declare module 'virtual:quiz-bank' {
	const bank: import('$lib/server/quiz/types').QuizBank;
	export default bank;
}
