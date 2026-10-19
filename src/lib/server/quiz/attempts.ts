// Starting and submitting quiz attempts: the logic behind /api/quiz/:id/meta,
// /api/attempts/start and /api/attempts/submit. Kept out of the route files so
// the tests can call it directly.
//
// Phase 1 handles anonymous topic-mode attempts only. Logged-in attempts
// (stored in D1) and the other modes arrive in Phase 2.

import { ANON_TOKEN_TTL_S, DRAFTS_SERVED_IN, MIN_QUESTIONS_PER_ATTEMPT } from '../config';
import { answerShapeError, mark } from '$lib/quiz/marking';
import type {
	Chosen,
	PublicOption,
	PublicQuestion,
	QuestionResult,
	QuizMeta,
	StartResult,
	SubmitResult,
	SubmittedAnswer
} from '$lib/quiz/public';
import { attemptSize, selectRandom } from './select';
import { signToken, verifyToken } from './token';
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

export async function startAttempt(
	quiz: Quiz,
	environment: string,
	secret: string,
	{ random = Math.random, now = Date.now() } = {}
): Promise<StartResult> {
	if (!quizMeta(quiz, environment).available) throw new QuizError(404, 'This quiz is not available yet.');
	const pool = servableQuestions(quiz, environment);
	const picked = selectRandom(pool, quiz.questions_per_attempt, quiz.exam_skills_per_attempt, random);
	const token = await signToken(
		{ v: 1, mode: 'topic', quiz_id: quiz.id, q: picked.map((q) => q.id), exp: now + ANON_TOKEN_TTL_S * 1000 },
		secret
	);
	return { token, questions: picked.map((q) => toPublic(q, quiz)) };
}

/** Check the general shape of the submitted answers; the choices are checked per question later. */
export function parseAnswers(raw: unknown): SubmittedAnswer[] {
	if (!Array.isArray(raw)) throw new QuizError(400, '"answers" should be a list.');
	return raw.map((a, i) => {
		const bad = (why: string) => new QuizError(400, `Answer ${i + 1}: ${why}`);
		if (typeof a !== 'object' || a === null) throw bad('should be an object.');
		const { question_id, chosen, dont_know, confidence } = a as Record<string, unknown>;
		if (typeof question_id !== 'string') throw bad('question_id is missing.');
		if (dont_know === true) {
			return { question_id, chosen: null, dont_know: true, confidence: null };
		}
		if (chosen === undefined || chosen === null) throw bad('choose an answer or "I don\'t know".');
		if (confidence !== 'sure' && confidence !== 'guess') throw bad('confidence should be "sure" or "guess".');
		return { question_id, chosen: chosen as Chosen, dont_know: false, confidence };
	});
}

/** The correct answer, in the same shape as a student's `chosen`. */
export function answerKey(q: Question): Chosen {
	return q.type === 'two_tier' ? { answer: q.answer, reason: q.reason.answer } : q.answer;
}

const whyWrong = (options: Option[]) => options.map((o) => o.why_wrong ?? null);

export async function submitAttempt(
	body: { token?: unknown; answers?: unknown },
	secret: string,
	lookup: (quizId: string) => Quiz | undefined,
	now = Date.now()
): Promise<SubmitResult> {
	const token = await verifyToken(body.token, secret, now);
	if (!token) throw new QuizError(400, 'This quiz has expired or is not valid. Please start it again.');

	const quiz = lookup(token.quiz_id);
	const questions = token.q.map((id) => quiz?.questions.find((q) => q.id === id));
	if (!quiz || questions.some((q) => !q)) {
		throw new QuizError(409, 'This quiz has been updated since you started. Please start it again.');
	}

	// The answers must be for exactly the questions that were served: no
	// missing ones, no extras and no duplicates.
	const answers = parseAnswers(body.answers);
	const byId = new Map(answers.map((a) => [a.question_id, a]));
	if (byId.size !== answers.length || answers.length !== token.q.length || token.q.some((id) => !byId.has(id))) {
		throw new QuizError(400, 'The answers don\'t match the questions in this quiz.');
	}

	const results = (questions as Question[]).map((q): QuestionResult => {
		const a = byId.get(q.id)!;
		const key = answerKey(q);
		if (a.chosen !== null) {
			const reasons = q.type === 'two_tier' ? q.reason.options.length : 0;
			const problem = answerShapeError(q.type, key, q.options.length, reasons, a.chosen);
			if (problem) throw new QuizError(400, `Question ${q.id}: the answer ${problem}.`);
		}
		const m = mark(q.type, key, a.chosen);
		// "Try again now" re-asks everything that wasn't both correct and Sure,
		// so those questions get every option's why_wrong.
		const retried = !(m.correct && a.confidence === 'sure');
		const bestAnswer = q.type === 'exam_skill' && q.format === 'best_answer';
		return {
			question_id: q.id,
			...m,
			chosen: a.chosen,
			dont_know: a.dont_know,
			confidence: a.confidence,
			answer: key,
			explanation: q.explanation,
			see: q.see ?? null,
			...(q.working && { working: q.working }),
			...((retried || bestAnswer) && { why_wrong: whyWrong(q.options) }),
			...(retried && q.type === 'two_tier' && { reason_why_wrong: whyWrong(q.reason.options) }),
			...(bestAnswer && { marks_awarded: q.options.map((o) => o.marks_awarded ?? 0) })
		};
	});

	return {
		score: results.reduce((sum, r) => sum + r.marks, 0),
		max_score: results.reduce((sum, r) => sum + r.max_marks, 0),
		results,
		past_papers: quiz.past_papers
	};
}
