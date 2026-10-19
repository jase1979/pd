// Things worth fixing in a quiz that don't stop the build. Printed by
// `npm run build` and listed again in quiz-report.md.

import {
	MAX_EXPLANATION_LENGTH,
	TARGET_CONTEXT_SHARE,
	TARGET_REVIEWED_EXAM_SKILLS,
	TARGET_REVIEWED_QUESTIONS
} from '../config';
import type { Question, Quiz } from './types';

/** Set in a product context: a shared scenario, or `context: true` for one written into the question. */
export const inContext = (q: Question) => q.scenario !== undefined || q.context === true;

export function quizWarnings(quiz: Quiz, file: string): string[] {
	const warnings: string[] = [];
	const warn = (msg: string) => warnings.push(`${file}: ${msg}`);
	const reviewed = quiz.questions.filter((q) => q.status === 'reviewed');
	const reviewedKnowledge = reviewed.filter((q) => q.type !== 'exam_skill');
	const reviewedConcepts = new Set(reviewedKnowledge.map((q) => q.concept)).size;

	if (reviewed.length < TARGET_REVIEWED_QUESTIONS) {
		warn(`only ${reviewed.length} reviewed questions (the target is at least ${TARGET_REVIEWED_QUESTIONS})`);
	}
	if (reviewedConcepts < quiz.questions_per_attempt) {
		warn(
			`only ${reviewedConcepts} reviewed concepts, fewer than questions_per_attempt (${quiz.questions_per_attempt}), so live attempts will be shorter`
		);
	}
	const reviewedSkills = reviewed.length - reviewedKnowledge.length;
	if (reviewedSkills < TARGET_REVIEWED_EXAM_SKILLS) {
		warn(`only ${reviewedSkills} reviewed exam_skill questions (the target is at least ${TARGET_REVIEWED_EXAM_SKILLS})`);
	}
	const share = quiz.questions.filter(inContext).length / quiz.questions.length;
	if (share < TARGET_CONTEXT_SHARE) {
		warn(
			`only ${Math.round(share * 100)}% of questions are set in a product context (the target is ${TARGET_CONTEXT_SHARE * 100}%); use a scenario, or add "context: true" to a question that describes its own product`
		);
	}

	for (const q of quiz.questions) {
		if (!q.see) warn(`question ${q.id}: no "see" link, so its feedback has no "Revise this" link`);
		const texts: [string, string | undefined][] = [
			['explanation', q.explanation],
			...q.options.map((o, i): [string, string | undefined] => [`option ${i} why_wrong`, o.why_wrong]),
			...(q.type === 'two_tier'
				? q.reason.options.map((o, i): [string, string | undefined] => [`reason option ${i} why_wrong`, o.why_wrong])
				: [])
		];
		for (const [what, text] of texts) {
			if (text && text.length > MAX_EXPLANATION_LENGTH) {
				warn(`question ${q.id}: ${what} is ${text.length} characters (aim for under ${MAX_EXPLANATION_LENGTH}: one or two sentences)`);
			}
		}
	}
	return warnings;
}
