// What the browser and the quiz API say to each other. Nothing here is
// secret: a PublicQuestion has no answers, and a QuestionResult is only sent
// after the attempt has been submitted.

export type QuestionType = 'single' | 'multi' | 'two_tier' | 'exam_skill';
export type SkillFormat = 'best_answer' | 'missing_point' | 'command_word';
export type Confidence = 'sure' | 'guess';

/** What a student chose, by original option index (before the browser shuffled them). */
export type Chosen =
	| number //                              single, exam_skill
	| number[] //                            multi
	| { answer: number; reason: number }; // two_tier

export interface PublicOption {
	text?: string;
	image?: string;
	image_alt?: string;
}

export interface PublicScenario {
	id: string;
	text: string;
	image?: string;
	image_alt?: string;
}

/** A question as the browser sees it before submitting: no answers or explanations. */
export interface PublicQuestion {
	id: string;
	type: QuestionType;
	text: string;
	image?: string;
	image_alt?: string;
	options: PublicOption[];
	/** multi: how many options to select. */
	select?: number;
	/** two_tier: the second tier. */
	reason?: { text: string; options: PublicOption[] };
	/** exam_skill only. */
	format?: SkillFormat;
	exam_question?: { text: string; marks: number };
	/** exam_skill missing_point: the answer that falls short. */
	sample_answer?: string;
	scenario?: PublicScenario;
}

export interface SubmittedAnswer {
	question_id: string;
	/** null for "I don't know". */
	chosen: Chosen | null;
	dont_know: boolean;
	/** null for "I don't know", which doesn't ask for a rating. */
	confidence: Confidence | null;
}

/** Feedback for one question, sent after submitting. */
export interface QuestionResult {
	question_id: string;
	marks: number;
	max_marks: number;
	/** True only for full marks. */
	correct: boolean;
	chosen: Chosen | null;
	dont_know: boolean;
	confidence: Confidence | null;
	/** The correct option(s), in the same shape as `chosen`. */
	answer: Chosen;
	explanation: string;
	/** Full path with anchor, for the "Revise this" link. */
	see: string | null;
	/** calculate questions: the worked solution. */
	working?: string;
	/**
	 * why_wrong for EVERY option (null for correct ones), not just the one
	 * chosen, so "Try again now" can explain whichever wrong option is picked
	 * next. Sent for every question that will be retried: anything not both
	 * correct and "Sure". Always sent for best_answer, where it explains each
	 * sample answer's marks.
	 */
	why_wrong?: (string | null)[];
	/** two_tier: the same, for the reason options. */
	reason_why_wrong?: (string | null)[];
	/** best_answer: the marks each sample answer would get. */
	marks_awarded?: number[];
}

export interface PastPaperLink {
	title: string;
	url: string;
}

export interface QuizMeta {
	id: string;
	title: string;
	/** False == the topic page shows nothing at all. */
	available: boolean;
	/** How many questions an attempt will have, exam technique included. */
	questions_per_attempt: number;
}

export interface StartResult {
	token: string;
	questions: PublicQuestion[];
}

export interface SubmitResult {
	score: number;
	max_score: number;
	results: QuestionResult[];
	/** "Try an exam question" links. */
	past_papers: PastPaperLink[];
}
