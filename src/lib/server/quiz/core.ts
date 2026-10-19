// The basics shared by every part of the quiz API: errors, which questions
// can be served in this environment, a quiz's availability, and the
// answer-free version of a question that is sent to the browser.

import { DRAFTS_SERVED_IN, MIN_QUESTIONS_PER_ATTEMPT } from '../config';
import type { Chosen, PublicOption, PublicQuestion, QuizMeta } from '$lib/quiz/public';
import { attemptSize } from './select';
import type { Option, Question, Quiz } from './types';

/** An error with the HTTP status the endpoint should answer with. */
export class QuizError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

/** The questions that may be served in this environment. */
export function servableQuestions(quiz: Quiz, environment: string): Question[] {
	const drafts = DRAFTS_SERVED_IN.includes(environment);
	return quiz.questions.filter((q) => q.status === 'reviewed' || drafts);
}

export function quizMeta(quiz: Quiz, environment: string): QuizMeta {
	const size = attemptSize(servableQuestions(quiz, environment), quiz.questions_per_attempt, quiz.exam_skills_per_attempt);
	// The minimum applies to knowledge questions: exam technique alone isn't a topic quiz.
	const available = size.knowledge >= MIN_QUESTIONS_PER_ATTEMPT;
	return {
		id: quiz.id,
		title: quiz.topic,
		available,
		questions_per_attempt: available ? size.knowledge + size.exam_skill : 0
	};
}

const publicOption = (o: Option): PublicOption => ({
	...(o.text !== undefined && { text: o.text }),
	...(o.image && { image: o.image, image_alt: o.image_alt })
});

/** A question with the answers, explanations, why_wrong and marks_awarded stripped out. */
export function toPublic(q: Question, quiz: Quiz): PublicQuestion {
	const scenario = q.scenario ? quiz.scenarios.find((s) => s.id === q.scenario) : undefined;
	return {
		id: q.id,
		type: q.type,
		text: q.text,
		...(q.image && { image: q.image, image_alt: q.image_alt }),
		options: q.options.map(publicOption),
		...(q.type === 'multi' && { select: q.answer.length }),
		...(q.type === 'two_tier' && { reason: { text: q.reason.text, options: q.reason.options.map(publicOption) } }),
		...(q.type === 'exam_skill' && {
			format: q.format,
			exam_question: q.exam_question,
			...(q.sample_answer && { sample_answer: q.sample_answer })
		}),
		...(scenario && { scenario })
	};
}

/** The correct answer, in the same shape as a student's `chosen`. */
export function answerKey(q: Question): Chosen {
	return q.type === 'two_tier' ? { answer: q.answer, reason: q.reason.answer } : q.answer;
}
