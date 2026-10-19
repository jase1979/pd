// A student's in-progress answer to one question, as the quiz screens hold
// it, and how it turns into the `chosen` the API expects.

import type { Chosen, Confidence, PublicOption, PublicQuestion } from './public';

export interface Draft {
	/** Chosen option indexes (original order). One for most types; `select` for multi. */
	picks: number[];
	/** two_tier: the chosen reason. */
	reason: number | null;
	dont_know: boolean;
	confidence: Confidence | null;
}

export const emptyDraft = (): Draft => ({ picks: [], reason: null, dont_know: false, confidence: null });

/** Has an answer (or "I don't know") been given? Confidence isn't needed for this. */
export function answered(q: PublicQuestion, d: Draft): boolean {
	if (d.dont_know) return true;
	if (q.type === 'multi') return d.picks.length === q.select;
	if (q.type === 'two_tier') return d.picks.length === 1 && d.reason !== null;
	return d.picks.length === 1;
}

/** Ready to move on: answered, plus a confidence rating unless it's "I don't know". */
export function complete(q: PublicQuestion, d: Draft, needConfidence = true): boolean {
	return answered(q, d) && (d.dont_know || !needConfidence || d.confidence !== null);
}

export function toChosen(q: PublicQuestion, d: Draft): Chosen | null {
	if (d.dont_know) return null;
	if (q.type === 'multi') return [...d.picks].sort((a, b) => a - b);
	if (q.type === 'two_tier') return { answer: d.picks[0], reason: d.reason! };
	return d.picks[0];
}

/** Text to show for an option in feedback: its text, or its alt text if it's an image. */
export const optionText = (o: PublicOption | undefined) => o?.text ?? o?.image_alt ?? '';

/** A shuffled 0..n-1, for showing options in a random order. */
export function shuffledOrder(n: number): number[] {
	const out = Array.from({ length: n }, (_, i) => i);
	for (let i = n - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** "Select TWO" etc., as exam papers word it. */
export function selectLabel(n: number): string {
	const words = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
	return `Select ${words[n] ?? n}`;
}
