// Starting and submitting quiz attempts: the logic behind /api/attempts/start
// and /api/attempts/submit. Kept out of the route files so the tests can call
// it directly.
//
// Every mode uses the same flow:
// - A logged-in student's attempt is stored in D1 when it starts, and its
//   answers when it's submitted. It can only be submitted once.
// - An anonymous attempt is carried in a signed token instead, and nothing is
//   stored (see token.ts).
// - Questions go out without answers; marking happens here, on submit.

import { ANON_TOKEN_TTL_S } from '../config';
import { cooldownUntil, loadHistory } from '../history';
import { attemptPace } from '../progress';
import type { Student } from '../students';
import { answerShapeError, mark } from '$lib/quiz/marking';
import type { Chosen, Mode, QuestionResult, StartResult, SubmitResult, SubmittedAnswer } from '$lib/quiz/public';
import { QuizError, answerKey, toPublic } from './core';
import { planAttempt, type PlanRequest } from './modes';
import { signToken, verifyToken } from './token';
import type { Option, Question, Quiz } from './types';

export { QuizError, answerKey, quizMeta, servableQuestions, toPublic } from './core';

export interface AttemptContext {
	quizzes: readonly Quiz[];
	environment: string;
	secret: string;
	/** Both set for a logged-in student. */
	db?: D1Database;
	student?: Student | null;
	random?: () => number;
	now?: number;
}

/** Every question in the bank, by id, with the quiz it belongs to. */
function indexQuestions(quizzes: readonly Quiz[]) {
	return new Map(quizzes.flatMap((quiz) => quiz.questions.map((q) => [q.id, { quiz, q }] as const)));
}

const loggedIn = (ctx: AttemptContext): ctx is AttemptContext & { db: D1Database; student: Student } =>
	!!ctx.db && !!ctx.student;

export async function startAttempt(req: PlanRequest, ctx: AttemptContext): Promise<StartResult> {
	const now = ctx.now ?? Date.now();
	const history = loggedIn(ctx) ? await loadHistory(ctx.db, ctx.student.id) : null;

	// The group's cooldown only applies to retrying the same topic quiz.
	if (loggedIn(ctx) && req.mode === 'topic' && typeof req.quiz_id === 'string') {
		const until = await cooldownUntil(ctx.db, ctx.student.id, ctx.student.group_id, req.quiz_id, now);
		if (until) {
			throw new QuizError(
				429,
				'Come back tomorrow — spacing it out helps it stick. In the meantime, try "Practise my mistakes" or "Mixed review".'
			);
		}
	}

	const plan = planAttempt(req, { quizzes: ctx.quizzes, environment: ctx.environment, history, random: ctx.random, now });
	const index = indexQuestions(ctx.quizzes);
	const questions = plan.questions.map((q) => toPublic(q, index.get(q.id)!.quiz));
	const timed = plan.time_limit_s !== null ? { time_limit_s: plan.time_limit_s } : {};

	if (loggedIn(ctx)) {
		const r = await ctx.db
			.prepare('INSERT INTO attempts (student_id, mode, quiz_id, question_ids, time_limit_s, started_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(ctx.student.id, plan.mode, plan.quiz_id, JSON.stringify(plan.questions.map((q) => q.id)), plan.time_limit_s, new Date(now).toISOString())
			.run();
		return { mode: plan.mode, attempt_id: r.meta.last_row_id, questions, ...timed, saving_as: ctx.student.username };
	}

	const token = await signToken(
		{
			v: 2,
			mode: plan.mode as 'topic' | 'mixed' | 'technique' | 'timed', // mistakes needs a login
			...(plan.quiz_id && { quiz_id: plan.quiz_id }),
			q: plan.questions.map((q) => q.id),
			exp: now + ANON_TOKEN_TTL_S * 1000,
			...(plan.time_limit_s !== null && { started: now, limit_s: plan.time_limit_s })
		},
		ctx.secret
	);
	return { mode: plan.mode, token, questions, ...timed };
}

/**
 * Check the general shape of the submitted answers; the choices themselves are
 * checked against each question later. Confidence is optional in timed
 * practice, to save time, and only timed answers may be "not reached".
 */
export function parseAnswers(raw: unknown, timed = false): SubmittedAnswer[] {
	if (!Array.isArray(raw)) throw new QuizError(400, '"answers" should be a list.');
	return raw.map((a, i) => {
		const bad = (why: string) => new QuizError(400, `Answer ${i + 1}: ${why}`);
		if (typeof a !== 'object' || a === null) throw bad('should be an object.');
		const { question_id, chosen, dont_know, confidence, not_reached } = a as Record<string, unknown>;
		if (typeof question_id !== 'string') throw bad('question_id is missing.');
		if (not_reached === true) {
			if (!timed) throw bad('only timed practice has unanswered questions.');
			return { question_id, chosen: null, dont_know: false, not_reached: true, confidence: null };
		}
		if (dont_know === true) {
			return { question_id, chosen: null, dont_know: true, confidence: null };
		}
		if (chosen === undefined || chosen === null) throw bad('choose an answer or "I don\'t know".');
		if (confidence !== 'sure' && confidence !== 'guess' && !(timed && (confidence === null || confidence === undefined))) {
			throw bad('confidence should be "sure" or "guess".');
		}
		return { question_id, chosen: chosen as Chosen, dont_know: false, confidence: (confidence ?? null) as SubmittedAnswer['confidence'] };
	});
}

const whyWrong = (options: Option[]) => options.map((o) => o.why_wrong ?? null);

/** Mark one answer and build its feedback. */
function result(q: Question, a: SubmittedAnswer): QuestionResult {
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
		...(a.not_reached && { not_reached: true }),
		confidence: a.confidence,
		answer: key,
		explanation: q.explanation,
		see: q.see ?? null,
		...(q.working && { working: q.working }),
		...((retried || bestAnswer) && { why_wrong: whyWrong(q.options) }),
		...(retried && q.type === 'two_tier' && { reason_why_wrong: whyWrong(q.reason.options) }),
		...(bestAnswer && { marks_awarded: q.options.map((o) => o.marks_awarded ?? 0) })
	};
}

interface AttemptRecord {
	mode: Mode;
	quiz_id: string | null;
	question_ids: string[];
	started: number;
	time_limit_s: number | null;
	/** Set if the attempt is stored and must be saved on submit. */
	stored?: { id: number; student: Student; db: D1Database };
}

/** The attempt being submitted, from the database (logged in) or its token (anonymous). */
async function findAttempt(body: { token?: unknown; attempt_id?: unknown }, ctx: AttemptContext, now: number): Promise<AttemptRecord> {
	if (body.attempt_id !== undefined) {
		if (!loggedIn(ctx)) throw new QuizError(401, "You've been logged out. Log in again, then start the quiz again.");
		const row = await ctx.db
			.prepare('SELECT id, mode, quiz_id, question_ids, time_limit_s, started_at, completed_at FROM attempts WHERE id = ? AND student_id = ?')
			.bind(body.attempt_id, ctx.student.id)
			.first<{ id: number; mode: Mode; quiz_id: string | null; question_ids: string; time_limit_s: number | null; started_at: string; completed_at: string | null }>();
		if (!row) throw new QuizError(404, 'That attempt was not found. Please start the quiz again.');
		if (row.completed_at) throw new QuizError(409, 'This attempt has already been submitted.');
		return {
			mode: row.mode,
			quiz_id: row.quiz_id,
			question_ids: JSON.parse(row.question_ids),
			started: Date.parse(row.started_at),
			time_limit_s: row.time_limit_s,
			stored: { id: row.id, student: ctx.student, db: ctx.db }
		};
	}
	const token = await verifyToken(body.token, ctx.secret, now);
	if (!token) throw new QuizError(400, 'This quiz has expired or is not valid. Please start it again.');
	return {
		mode: token.mode,
		quiz_id: token.quiz_id ?? null,
		question_ids: token.q,
		started: token.started ?? now,
		time_limit_s: token.limit_s ?? null
	};
}

export async function submitAttempt(
	body: { token?: unknown; attempt_id?: unknown; answers?: unknown },
	ctx: AttemptContext
): Promise<SubmitResult> {
	const now = ctx.now ?? Date.now();
	const attempt = await findAttempt(body, ctx, now);
	const timed = attempt.mode === 'timed';

	const index = indexQuestions(ctx.quizzes);
	const served = attempt.question_ids.map((id) => index.get(id));
	if (served.some((s) => !s)) {
		throw new QuizError(409, 'This quiz has been updated since you started. Please start it again.');
	}

	// The answers must be for exactly the questions that were served: no
	// missing ones, no extras and no duplicates.
	const answers = parseAnswers(body.answers, timed);
	const byId = new Map(answers.map((a) => [a.question_id, a]));
	const ids = attempt.question_ids;
	if (byId.size !== answers.length || answers.length !== ids.length || ids.some((id) => !byId.has(id))) {
		throw new QuizError(400, "The answers don't match the questions in this quiz.");
	}

	const results = served.map((s) => result(s!.q, byId.get(s!.q.id)!));
	const score = results.reduce((sum, r) => sum + r.marks, 0);
	const max_score = results.reduce((sum, r) => sum + r.max_marks, 0);
	const timeTaken = Math.round((now - attempt.started) / 1000);
	const pace = timed
		? attemptPace(results.map((r) => ({ not_reached: !!r.not_reached, max_marks: r.max_marks })), timeTaken, attempt.time_limit_s ?? 0)
		: undefined;

	if (attempt.stored) {
		const { db, id, student } = attempt.stored;
		const completedAt = new Date(now).toISOString();
		// One transaction. Every insert is guarded by "not yet completed", and the
		// final update only matches an uncompleted attempt, so a double submit
		// saves nothing the second time.
		const guard = 'WHERE EXISTS (SELECT 1 FROM attempts WHERE id = ? AND completed_at IS NULL)';
		const inserts = served.map((s, i) => {
			const { q } = s!;
			const r = results[i];
			return db
				.prepare(
					`INSERT INTO attempt_answers (attempt_id, question_id, quiz_id, spec_point, concept, command, qtype, skill_format,
					   chosen, dont_know, not_reached, confidence, marks, max_marks, correct)
					 SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ${guard}`
				)
				.bind(
					id, q.id, s!.quiz.id, q.spec_point, q.concept, q.command, q.type, q.type === 'exam_skill' ? q.format : null,
					r.chosen === null ? null : JSON.stringify(r.chosen), r.dont_know ? 1 : 0, r.not_reached ? 1 : 0,
					r.confidence, r.marks, r.max_marks, r.correct ? 1 : 0, id
				);
		});
		const complete = db
			.prepare('UPDATE attempts SET score = ?, max_score = ?, completed_at = ?, time_taken_s = ?, overtime = ? WHERE id = ? AND completed_at IS NULL')
			.bind(score, max_score, completedAt, timeTaken, pace?.overtime ? 1 : 0, id);
		const touch = db.prepare('UPDATE students SET last_active_at = ? WHERE id = ?').bind(completedAt, student.id);
		const out = await db.batch([...inserts, complete, touch]);
		if (out.at(-2)?.meta.changes !== 1) throw new QuizError(409, 'This attempt has already been submitted.');
	}

	const quiz = attempt.quiz_id && attempt.mode === 'topic' ? ctx.quizzes.find((q) => q.id === attempt.quiz_id) : undefined;
	return {
		mode: attempt.mode,
		score,
		max_score,
		results,
		past_papers: quiz?.past_papers ?? [],
		...(pace && { pace }),
		saved: !!attempt.stored
	};
}

