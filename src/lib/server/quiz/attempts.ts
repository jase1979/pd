// Starting and submitting quiz attempts: the logic behind /api/quiz/:id/meta,
// /api/attempts/start and /api/attempts/submit. Kept out of the route files so
// the tests can call it directly.
//
// Phase 1a handles anonymous topic-mode attempts only. Logged-in attempts
// (stored in D1) and the other modes arrive in Phase 2.

import { ANON_TOKEN_TTL_S, DRAFTS_SERVED_IN, MIN_QUESTIONS_PER_ATTEMPT } from '../config';
import { markAnswer, type SubmittedAnswer } from './mark';
import { attemptSize, selectRandom } from './select';
import { signToken, verifyToken } from './token';
import type { PublicQuestion, Question, Quiz } from './types';

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

export interface QuizMeta {
	id: string;
	title: string;
	/** False == the topic page shows nothing at all. */
	available: boolean;
	/** How many questions an attempt will have. */
	questions_per_attempt: number;
}

export function quizMeta(quiz: Quiz, environment: string): QuizMeta {
	const size = attemptSize(servableQuestions(quiz, environment), quiz.questions_per_attempt);
	const available = size >= MIN_QUESTIONS_PER_ATTEMPT;
	return { id: quiz.id, title: quiz.topic, available, questions_per_attempt: available ? size : 0 };
}

/** A question with the answer, explanations and why_wrong stripped out. */
export function toPublic(q: Question): PublicQuestion {
	return {
		id: q.id,
		type: q.type,
		text: q.text,
		...(q.image && { image: q.image, image_alt: q.image_alt }),
		options: q.options.map((o) => ({
			...(o.text !== undefined && { text: o.text }),
			...(o.image && { image: o.image, image_alt: o.image_alt })
		}))
	};
}

export interface StartResult {
	token: string;
	questions: PublicQuestion[];
}

export async function startAttempt(
	quiz: Quiz,
	environment: string,
	secret: string,
	{ random = Math.random, now = Date.now() } = {}
): Promise<StartResult> {
	if (!quizMeta(quiz, environment).available) throw new QuizError(404, 'This quiz is not available yet.');
	const picked = selectRandom(servableQuestions(quiz, environment), quiz.questions_per_attempt, random);
	const token = await signToken(
		{ v: 1, mode: 'topic', quiz_id: quiz.id, q: picked.map((q) => q.id), exp: now + ANON_TOKEN_TTL_S * 1000 },
		secret
	);
	return { token, questions: picked.map(toPublic) };
}

/** Feedback for one question. Everything the feedback screen needs, in served order. */
export interface QuestionResult {
	question_id: string;
	marks: number;
	max_marks: number;
	correct: boolean;
	chosen: number | null;
	dont_know: boolean;
	confidence: 'sure' | 'guess' | null;
	/** Index of the correct option. */
	answer: number;
	explanation: string;
	/** Full path with anchor, for the "Revise this" link. */
	see: string | null;
	/**
	 * Only for questions not answered fully correctly: why_wrong for EVERY
	 * option (null for the correct one), not just the one chosen, so "Try again
	 * now" can explain whichever wrong option the student picks next time.
	 */
	why_wrong?: (string | null)[];
}

export interface SubmitResult {
	score: number;
	max_score: number;
	results: QuestionResult[];
}

/** Check the shape of the submitted answers; throws a 400 QuizError if anything is off. */
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
		if (!Number.isInteger(chosen)) throw bad('choose an option or "I don\'t know".');
		if (confidence !== 'sure' && confidence !== 'guess') throw bad('confidence should be "sure" or "guess".');
		return { question_id, chosen: chosen as number, dont_know: false, confidence };
	});
}

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
		if (a.chosen !== null && a.chosen >= q.options.length) {
			throw new QuizError(400, `Question ${q.id}: there is no option ${a.chosen}.`);
		}
		const mark = markAnswer(q, a);
		return {
			question_id: q.id,
			...mark,
			chosen: a.chosen,
			dont_know: a.dont_know,
			confidence: a.confidence,
			answer: q.answer,
			explanation: q.explanation,
			see: q.see ?? null,
			...(!mark.correct && { why_wrong: q.options.map((o) => o.why_wrong ?? null) })
		};
	});

	return {
		score: results.reduce((sum, r) => sum + r.marks, 0),
		max_score: results.reduce((sum, r) => sum + r.max_marks, 0),
		results
	};
}

