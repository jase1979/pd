// The shape of a quiz file in content/quizzes/, once it has passed validation,
// and of the answer-free version that is sent to the browser.
//
// Phase 1a supports `single` questions only; multi, two_tier and exam_skill
// arrive in Phase 1b.

export const SPECS = ['gcse-legacy', 'gcse-2026'] as const;
export const STATUSES = ['draft', 'reviewed'] as const;
export const QUESTION_TYPES = ['single'] as const;

/** Command words a `single` question may use. */
export const SINGLE_COMMANDS = ['identify', 'state', 'describe', 'calculate'] as const;

export type Status = (typeof STATUSES)[number];

export interface Option {
	text?: string;
	image?: string;
	image_alt?: string;
	/** Why this option is wrong. Only on incorrect options. */
	why_wrong?: string;
}

export interface Question {
	id: string;
	type: 'single';
	status: Status;
	spec_point: string;
	concept: string;
	command: string;
	/** "#anchor" on the quiz's own page, or "/full/path/#anchor". */
	see?: string;
	text: string;
	image?: string;
	image_alt?: string;
	options: Option[];
	/** Zero-based index into options. */
	answer: number;
	explanation: string;
}

export interface Quiz {
	id: string;
	spec: (typeof SPECS)[number];
	unit: string;
	topic: string;
	/** The topic page the quiz appears on, e.g. /gcse/unit2/timber/ */
	page: string;
	questions_per_attempt: number;
	questions: Question[];
}

/** Every quiz, answers included. Server-only: see quiz/vite-plugin.ts. */
export interface QuizBank {
	quizzes: Quiz[];
}

/** A question as the browser sees it before submitting: no answers or explanations. */
export interface PublicQuestion {
	id: string;
	type: Question['type'];
	text: string;
	image?: string;
	image_alt?: string;
	options: { text?: string; image?: string; image_alt?: string }[];
}
