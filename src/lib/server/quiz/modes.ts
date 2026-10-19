// Which questions each practice mode serves (the rules are in the spec,
// "Practice modes"). Pure: the caller supplies the quizzes, the environment
// and, for a logged-in student, their history.
//
// Rules shared by every mode: at most one question per concept, never a
// question that can't be served here (e.g. a draft on the live site), and at
// least MIN_QUESTIONS_PER_ATTEMPT questions or the attempt isn't started.

import {
	AVOID_RECENT_HOURS,
	DEFAULT_EXAM_SKILLS_PER_ATTEMPT,
	MIN_QUESTIONS_PER_ATTEMPT,
	MISTAKES_PER_ATTEMPT,
	MIXED_MIN_WEIGHT,
	MIXED_PER_ATTEMPT,
	MIXED_RECENCY_DAYS,
	SECONDS_PER_MARK,
	TECHNIQUE_PER_ATTEMPT,
	TIMED_MAX_EXAM_SKILLS,
	TIMED_PER_ATTEMPT
} from '../config';
import type { History } from '../history';
import { examTechnique, mistakeList, topicProgress, type QuizInfo } from '../progress';
import { maxMarks } from '$lib/quiz/marking';
import type { Mode } from '$lib/quiz/public';
import { QuizError, answerKey, quizMeta, servableQuestions } from './core';
import { drawWeighted, groupByScenario, selectLeastRecent, selectRandom, type WeightedPool } from './select';
import type { Question, Quiz } from './types';

export interface PlanContext {
	quizzes: readonly Quiz[];
	environment: string;
	/** Set for a logged-in student. */
	history?: History | null;
	random?: () => number;
	now?: number;
}

export interface PlanRequest {
	mode: Mode;
	/** topic mode (required), and mistakes mode (optional: one topic's mistakes). */
	quiz_id?: string;
	/** mixed / technique / timed: the topics to draw from. Required when not logged in. */
	topics?: string[];
	/** mixed: only questions on these spec points (set work reviewing weak spec points). */
	spec_points?: string[];
}

export interface Plan {
	mode: Mode;
	quiz_id: string | null;
	questions: Question[];
	/** timed mode only. */
	time_limit_s: number | null;
}

const DAY = 24 * 3600_000;
const isSkill = (q: Question) => q.type === 'exam_skill';

/** What progress.ts needs to know about a quiz, in this environment. */
export function quizInfo(quiz: Quiz, environment: string): QuizInfo {
	const servable = servableQuestions(quiz, environment);
	return {
		id: quiz.id,
		title: quiz.topic,
		unit: quiz.unit,
		page: quiz.page,
		concepts: new Set(servable.filter((q) => !isSkill(q)).map((q) => q.concept)).size,
		question_ids: servable.map((q) => q.id)
	};
}

/** Question id -> when it was last answered (not counting "not reached"). */
function lastSeen(history: History): Map<string, string> {
	const seen = new Map<string, string>();
	for (const a of history.answers) if (!a.not_reached) seen.set(a.question_id, a.answered_at);
	return seen;
}

function recentlyAnswered(history: History | null | undefined, now: number): Set<string> {
	const cutoff = now - AVOID_RECENT_HOURS * 3600_000;
	return new Set(history?.answers.filter((a) => Date.parse(a.answered_at) >= cutoff).map((a) => a.question_id) ?? []);
}

/** The quizzes a multi-topic mode draws from: the chosen ones, or those the student has practised. */
function topicsFor(req: PlanRequest, ctx: PlanContext): Quiz[] {
	const usable = ctx.quizzes.filter((q) => quizMeta(q, ctx.environment).available || servableQuestions(q, ctx.environment).some(isSkill));
	if (req.topics !== undefined) {
		if (!Array.isArray(req.topics) || req.topics.length === 0) throw new QuizError(400, 'Choose at least one topic.');
		const chosen = usable.filter((q) => req.topics!.includes(q.id));
		if (chosen.length === 0) throw new QuizError(400, 'None of those topics have questions yet.');
		return chosen;
	}
	if (!ctx.history) throw new QuizError(400, 'Choose the topics to include.');
	const practised = new Set(ctx.history.answers.map((a) => a.quiz_id));
	const chosen = usable.filter((q) => practised.has(q.id));
	if (chosen.length === 0) {
		throw new QuizError(409, "Try a topic quiz first: this mode mixes the topics you've already practised.");
	}
	return chosen;
}

/**
 * Mixed-review weight for a topic: weaker and less recently practised topics
 * come up more often, but every topic can still come up.
 *   weight = (1 − mastery) + min(days since last practised / 28, 1)
 */
export function topicWeight(mastery: number | undefined, lastPractised: string | undefined, now: number): number {
	const days = lastPractised ? (now - Date.parse(lastPractised)) / DAY : MIXED_RECENCY_DAYS;
	return Math.max(MIXED_MIN_WEIGHT, 1 - (mastery ?? 0) + Math.min(days / MIXED_RECENCY_DAYS, 1));
}

function weightedPools(quizzes: Quiz[], ctx: PlanContext, filter: (q: Question) => boolean): WeightedPool[] {
	const now = ctx.now ?? Date.now();
	return quizzes.map((quiz) => {
		let weight = 1; // anonymous: every chosen topic equally
		if (ctx.history) {
			const p = topicProgress(quizInfo(quiz, ctx.environment), ctx.history, now);
			weight = topicWeight(p.mastery, p.last_practised, now);
		}
		return { quiz_id: quiz.id, weight, questions: servableQuestions(quiz, ctx.environment).filter(filter) };
	});
}

function minimum(questions: Question[], what: string): Question[] {
	if (questions.length < MIN_QUESTIONS_PER_ATTEMPT) {
		throw new QuizError(409, `There aren't enough ${what} yet to start this (it needs at least ${MIN_QUESTIONS_PER_ATTEMPT}).`);
	}
	return questions;
}

export function planAttempt(req: PlanRequest, ctx: PlanContext): Plan {
	const random = ctx.random ?? Math.random;
	const now = ctx.now ?? Date.now();
	const history = ctx.history ?? null;
	const recent = recentlyAnswered(history, now);
	const plan = (mode: Mode, questions: Question[], quiz_id: string | null = null, time_limit_s: number | null = null): Plan => ({
		mode,
		quiz_id,
		questions,
		time_limit_s
	});

	switch (req.mode) {
		case 'topic': {
			const quiz = typeof req.quiz_id === 'string' ? ctx.quizzes.find((q) => q.id === req.quiz_id) : undefined;
			if (!quiz) throw new QuizError(404, 'No such quiz.');
			if (!quizMeta(quiz, ctx.environment).available) throw new QuizError(404, 'This quiz is not available yet.');
			const pool = servableQuestions(quiz, ctx.environment);
			const questions = history
				? selectLeastRecent(pool, quiz.questions_per_attempt, quiz.exam_skills_per_attempt, lastSeen(history), random)
				: selectRandom(pool, quiz.questions_per_attempt, quiz.exam_skills_per_attempt, random);
			return plan('topic', questions, quiz.id);
		}

		case 'mistakes': {
			if (!history) throw new QuizError(401, 'Log in to practise your mistakes.');
			const byId = new Map(ctx.quizzes.flatMap((quiz) => servableQuestions(quiz, ctx.environment).map((q) => [q.id, { quiz, q }] as const)));
			const list = mistakeList(history.answers).filter((m) => byId.has(m.question_id) && (!req.quiz_id || m.quiz_id === req.quiz_id));
			if (list.length === 0) throw new QuizError(404, 'No mistakes to practise right now. Nice work!');
			// Most recent mistakes first, one per concept within each quiz.
			const used = new Set<string>();
			const questions: Question[] = [];
			for (const m of list) {
				if (questions.length === MISTAKES_PER_ATTEMPT) break;
				const key = `${m.quiz_id}\0${m.concept}`;
				if (used.has(key)) continue;
				used.add(key);
				questions.push(byId.get(m.question_id)!.q);
			}
			// Not held to the minimum of 5: two waiting mistakes are still worth practising.
			const ordered = [...questions.filter((q) => !isSkill(q)), ...questions.filter(isSkill)];
			return plan('mistakes', ordered, req.quiz_id ?? null);
		}

		case 'mixed': {
			const quizzes = topicsFor(req, ctx);
			const used = new Set<string>();
			const onSpec = (q: Question) => !req.spec_points || req.spec_points.includes(q.spec_point);
			const knowledge = drawWeighted(weightedPools(quizzes, ctx, (q) => !isSkill(q) && onSpec(q)), MIXED_PER_ATTEMPT, { recent, used, random });
			const skills = drawWeighted(weightedPools(quizzes, ctx, (q) => isSkill(q) && onSpec(q)), DEFAULT_EXAM_SKILLS_PER_ATTEMPT, { recent, used, random });
			return plan('mixed', [...groupByScenario(minimum(knowledge, 'questions in those topics')), ...skills]);
		}

		case 'technique': {
			const quizzes = topicsFor(req, ctx);
			const pool = quizzes.flatMap((quiz) => servableQuestions(quiz, ctx.environment).filter(isSkill).map((q) => ({ quiz, q })));
			let ordered: Question[];
			if (history) {
				// Weighted towards the formats and command words this student does worst on.
				const profile = examTechnique(history.answers);
				const creditOf = (groups: { key: string; credit: number }[] | undefined, key: string) =>
					groups?.find((g) => g.key === key)?.credit ?? 0.5; // no data yet: middling
				const pools: WeightedPool[] = pool.map(({ quiz, q }) => ({
					quiz_id: quiz.id,
					weight: Math.max(
						MIXED_MIN_WEIGHT,
						(1 - creditOf(profile?.by_format, q.type === 'exam_skill' ? q.format : '')) + (1 - creditOf(profile?.by_command, q.command))
					),
					questions: [q]
				}));
				ordered = drawWeighted(pools, TECHNIQUE_PER_ATTEMPT, { recent, random });
			} else {
				const used = new Set<string>();
				ordered = drawWeighted(
					quizzes.map((quiz) => ({ quiz_id: quiz.id, weight: 1, questions: servableQuestions(quiz, ctx.environment).filter(isSkill) })),
					TECHNIQUE_PER_ATTEMPT,
					{ used, random }
				);
			}
			return plan('technique', groupByScenario(minimum(ordered, 'exam technique questions in those topics')));
		}

		case 'timed': {
			const quizzes = topicsFor(req, ctx);
			const used = new Set<string>();
			const skills = drawWeighted(weightedPools(quizzes, ctx, isSkill), TIMED_MAX_EXAM_SKILLS, { recent, used, random });
			const knowledge = drawWeighted(weightedPools(quizzes, ctx, (q) => !isSkill(q)), TIMED_PER_ATTEMPT - skills.length, {
				recent,
				used,
				random
			});
			const questions = [...groupByScenario(knowledge), ...skills];
			minimum(questions, 'questions in those topics');
			// The limit is the total marks × SECONDS_PER_MARK.
			const marks = questions.reduce((s, q) => s + maxMarks(q.type, answerKey(q)), 0);
			return plan('timed', questions, null, marks * SECONDS_PER_MARK);
		}

		default:
			throw new QuizError(400, 'mode should be one of: topic, mistakes, mixed, technique, timed.');
	}
}

