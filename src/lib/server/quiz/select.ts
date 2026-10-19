// Choosing which questions go into an attempt.
//
// The one rule that is never broken: an attempt has at most one question per
// concept, so two differently worded versions of the same idea never appear
// together. If that leaves fewer than questions_per_attempt, the attempt is
// simply shorter (see MIN_QUESTIONS_PER_ATTEMPT for when it is too short).

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

/** How many questions an attempt can have: the target, or fewer if there aren't enough concepts. */
export function attemptSize(pool: readonly Question[], perAttempt: number): number {
	return Math.min(perAttempt, new Set(pool.map((q) => q.concept)).size);
}

/**
 * A random selection of up to `n` questions, one per concept, in random order.
 * Used for anonymous attempts. (Logged-in students get least-recently-seen
 * selection in Phase 2.)
 */
export function selectRandom(pool: readonly Question[], n: number, random: () => number = Math.random): Question[] {
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
