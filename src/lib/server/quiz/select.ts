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

/** Up to `n` questions from `pool`, one per concept, chosen at random. */
function pickByConcept(pool: readonly Question[], n: number, random: () => number): Question[] {
	const seen = new Set<string>();
	const picked: Question[] = [];
	for (const q of shuffle(pool, random)) {
		if (picked.length === n) break;
		if (seen.has(q.concept)) continue;
		seen.add(q.concept);
		picked.push(q);
	}
	return picked;
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
