// The shape of a quiz file in content/quizzes/, once it has passed validation.
// Server-only: these include the answers. What the browser sees is in
// $lib/quiz/public.ts.

import type { PastPaperLink, QuestionType, SkillFormat } from '$lib/quiz/public';

export const SPECS = ['gcse-legacy', 'gcse-2026'] as const;
export const STATUSES = ['draft', 'reviewed'] as const;
export const QUESTION_TYPES = ['single', 'multi', 'two_tier', 'exam_skill'] as const;
export const SKILL_FORMATS = ['best_answer', 'missing_point', 'command_word'] as const;

/**
 * Command words each question type may use. evaluate and discuss are kept for
 * exam_skill (and future written) questions, so a recall question can't claim
 * to test a writing skill it can't test.
 */
export const COMMANDS: Record<QuestionType, readonly string[]> = {
	single: ['identify', 'state', 'describe', 'calculate'],
	multi: ['identify', 'state', 'describe', 'calculate'],
	two_tier: ['identify', 'state', 'describe', 'calculate', 'explain', 'compare'],
	exam_skill: ['identify', 'state', 'describe', 'explain', 'compare', 'discuss', 'evaluate', 'calculate']
};

export type Status = (typeof STATUSES)[number];

export interface Option {
	text?: string;
	image?: string;
	image_alt?: string;
	/** Why this option is wrong. Only on incorrect options. */
	why_wrong?: string;
	/** exam_skill best_answer: the marks this sample answer would get. */
	marks_awarded?: number;
}

export interface Scenario {
	id: string;
	text: string;
	image?: string;
	image_alt?: string;
}

interface BaseQuestion {
	id: string;
	status: Status;
	spec_point: string;
	concept: string;
	command: string;
	/** Full path with anchor ("#anchor" in the YAML is resolved to the quiz's page). */
	see?: string;
	text: string;
	image?: string;
	image_alt?: string;
	/** Id of a scenario in the same quiz. */
	scenario?: string;
	/** True if the question sets out its own product context (counts towards the "half in context" target). */
	context?: boolean;
	options: Option[];
	explanation: string;
	/** command: calculate only. A worked solution shown in the feedback. */
	working?: string;
}

export interface SingleQuestion extends BaseQuestion {
	type: 'single';
	/** Zero-based index into options. */
	answer: number;
}

export interface MultiQuestion extends BaseQuestion {
	type: 'multi';
	/** Zero-based indexes of every correct option. */
	answer: number[];
}

export interface TwoTierQuestion extends BaseQuestion {
	type: 'two_tier';
	answer: number;
	reason: { text: string; options: Option[]; answer: number };
}

export interface ExamSkillQuestion extends BaseQuestion {
	type: 'exam_skill';
	format: SkillFormat;
	exam_question: { text: string; marks: number };
	/** missing_point only. */
	sample_answer?: string;
	answer: number;
}

export type Question = SingleQuestion | MultiQuestion | TwoTierQuestion | ExamSkillQuestion;

export interface Quiz {
	id: string;
	spec: (typeof SPECS)[number];
	unit: string;
	topic: string;
	/** The topic page the quiz appears on, e.g. /gcse/unit2/timber/ */
	page: string;
	/** Knowledge questions per attempt (everything except exam_skill). */
	questions_per_attempt: number;
	/** exam_skill questions per attempt, shown after the knowledge questions. */
	exam_skills_per_attempt: number;
	past_papers: PastPaperLink[];
	scenarios: Scenario[];
	questions: Question[];
}

/** Every quiz, answers included. Server-only: see quiz/vite-plugin.ts. */
export interface QuizBank {
	quizzes: Quiz[];
}
