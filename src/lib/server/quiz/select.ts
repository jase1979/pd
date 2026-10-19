// Choosing which questions go into an attempt.
//
// The one rule that is never broken: an attempt has at most one question per
// concept, so two differently worded versions of the same idea never appear
// together. If that leaves fewer than questions_per_attempt, the attempt is
// simply shorter (see MIN_QUESTIONS_PER_ATTEMPT for when it is too short).
//
// Knowledge questions come first and exam_skill questions last, as the spec
// asks. Within each, questions sharing a scenario are put next to each other,
// so the scenario panel stays on screen rather than coming and going.

import type { Question } from './types';

/** Fisher–Yates shuffle into a new array. `random` is swappable for the tests. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

const isSkill = (q: Question) => q.type === 'exam_skill';
const conceptCount = (qs: readonly Question[]) => new Set(qs.map((q) => q.concept)).size;

export interface AttemptSize {
	/** Knowledge questions (everything except exam_skill). */
	knowledge: number;
	exam_skill: number;
}

/** How many questions an attempt can have: the targets, or fewer if there aren't enough concepts. */
export function attemptSize(pool: readonly Question[], perAttempt: number, skillsPerAttempt: number): AttemptSize {
	return {
		knowledge: Math.min(perAttempt, conceptCount(pool.filter((q) => !isSkill(q)))),
		exam_skill: Math.min(skillsPerAttempt, conceptCount(pool.filter(isSkill)))
	};
}

/** The first `n` questions of `ordered`, skipping any whose concept is already in. */
export function firstByConcept(ordered: readonly Question[], n: number, used = new Set<string>()): Question[] {
	const picked: Question[] = [];
	for (const q of ordered) {
		if (picked.length === n) break;
		if (used.has(q.concept)) continue;
		used.add(q.concept);
		picked.push(q);
	}
	return picked;
}

/** Up to `n` questions from `pool`, one per concept, chosen at random. */
function pickByConcept(pool: readonly Question[], n: number, random: () => number): Question[] {
	return firstByConcept(shuffle(pool, random), n);
}

/** Reorder so questions with the same scenario are adjacent, keeping the first-seen order otherwise. */
export function groupByScenario(questions: Question[]): Question[] {
	const groups = new Map<string, Question[]>();
	questions.forEach((q, i) => {
		const key = q.scenario ?? `\0${i}`; // no scenario: a group of its own
		groups.set(key, [...(groups.get(key) ?? []), q]);
	});
	return [...groups.values()].flat();
}

/**
 * A random selection for an anonymous attempt: knowledge questions, then
 * exam_skill questions, one per concept. (Logged-in students get
 * least-recently-seen selection in Phase 2.)
 */
export function selectRandom(
	pool: readonly Question[],
	perAttempt: number,
	skillsPerAttempt: number,
	random: () => number = Math.random
): Question[] {
	return [
		...groupByScenario(pickByConcept(pool.filter((q) => !isSkill(q)), perAttempt, random)),
		...groupByScenario(pickByConcept(pool.filter(isSkill), skillsPerAttempt, random))
	];
}

/**
 * Least-recently-seen selection, for a logged-in student's topic quiz: never
 * seen questions first (in random order), then the ones seen longest ago, so
 * retries don't just repeat what they've memorised. Still one per concept.
 *
 * `seen` maps question id to when it was last answered in a submitted attempt.
 */
export function selectLeastRecent(
	pool: readonly Question[],
	perAttempt: number,
	skillsPerAttempt: number,
	seen: Map<string, string>,
	random: () => number = Math.random
): Question[] {
	const order = (qs: Question[]) =>
		shuffle(qs, random).sort((a, b) => {
			const ta = seen.has(a.id) ? Date.parse(seen.get(a.id)!) : -Infinity;
			const tb = seen.has(b.id) ? Date.parse(seen.get(b.id)!) : -Infinity;
			return ta - tb; // sort is stable, so ties keep their random order
		});
	return [
		...groupByScenario(firstByConcept(order(pool.filter((q) => !isSkill(q))), perAttempt)),
		...groupByScenario(firstByConcept(order(pool.filter(isSkill)), skillsPerAttempt))
	];
}

/** Index into `weights`, chosen with probability proportional to its weight. */
export function weightedIndex(weights: number[], random: () => number = Math.random): number {
	const total = weights.reduce((s, w) => s + w, 0);
	let r = random() * total;
	for (let i = 0; i < weights.length; i++) {
		r -= weights[i];
		if (r < 0) return i;
	}
	return weights.length - 1;
}

export interface WeightedPool {
	/** Concepts are per quiz, so the one-per-concept rule is applied per quiz. */
	quiz_id: string;
	weight: number;
	questions: Question[];
}

/**
 * Up to `n` questions across several topics. Each pick chooses a topic by
 * weight, then a question from it, preferring ones not answered recently,
 * never repeating a concept. A topic with nothing left drops out.
 */
export function drawWeighted(
	pools: WeightedPool[],
	n: number,
	{ recent = new Set<string>(), used = new Set<string>(), random = Math.random }: { recent?: Set<string>; used?: Set<string>; random?: () => number } = {}
): Question[] {
	const live = pools.map((p) => ({ ...p, questions: shuffle(p.questions, random) }));
	const picked: Question[] = [];
	while (picked.length < n && live.length > 0) {
		const i = weightedIndex(live.map((p) => p.weight), random);
		const pool = live[i];
		const candidates = pool.questions.filter((q) => !used.has(`${pool.quiz_id}\0${q.concept}`));
		if (candidates.length === 0) {
			live.splice(i, 1);
			continue;
		}
		const q = candidates.find((c) => !recent.has(c.id)) ?? candidates[0];
		used.add(`${pool.quiz_id}\0${q.concept}`);
		pool.questions = pool.questions.filter((x) => x !== q);
		picked.push(q);
	}
	return picked;
}

