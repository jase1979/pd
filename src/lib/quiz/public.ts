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
	/** null for "I don't know", or a timed question that wasn't reached. */
	chosen: Chosen | null;
	dont_know: boolean;
	/** Timed practice: time ran out before this question was answered. */
	not_reached?: boolean;
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
	not_reached?: boolean;
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
	/** Logged in: when the group's retry cooldown allows the next attempt, if it's in force now. */
	cooldown_until?: string | null;
	/** Logged in: has this student finished this quiz before? (for the first-attempt message) */
	attempted?: boolean;
}

export interface StartResult {
	mode: Mode;
	/** Anonymous attempts: the signed token to send back on submit. */
	token?: string;
	/** Logged-in attempts: the saved attempt's id. */
	attempt_id?: number;
	questions: PublicQuestion[];
	/** Timed practice only. */
	time_limit_s?: number;
	/** Logged in: whose record this attempt will be saved to. */
	saving_as?: string;
}

export interface SubmitResult {
	mode: Mode;
	score: number;
	max_score: number;
	results: QuestionResult[];
	/** "Try an exam question" links (topic quizzes). */
	past_papers: PastPaperLink[];
	/** Timed practice only. */
	pace?: AttemptPace;
	/** True if this attempt was saved to a student's record. */
	saved: boolean;
}

// ---- Practice modes and progress (Phase 2) ---------------------------------------

export type Mode = 'topic' | 'mistakes' | 'mixed' | 'technique' | 'timed';

/** Pace figures for one timed attempt, on its feedback screen. */
export interface AttemptPace {
	reached: number;
	total: number;
	time_taken_s: number;
	time_limit_s: number;
	overtime: boolean;
	seconds_per_question: number | null;
	target_seconds_per_question: number | null;
	seconds_per_mark: number | null;
	target_seconds_per_mark: number;
}

export interface FigureStatus {
	status: 'secure' | 'getting_there' | 'not_secure';
	label: string;
}

export interface TopicProgress {
	quiz_id: string;
	title: string;
	unit: string;
	page: string;
	status: 'secure' | 'getting_there' | 'not_secure' | 'not_started';
	/** "Secure", "Getting there", ... */
	label: string;
	/** Why it's "Getting there" rather than Secure, e.g. "come back another day to lock it in". */
	note?: string;
	due_for_review?: boolean;
	mastery?: number;
	coverage?: number;
	spacing_met?: boolean;
	last_practised?: string;
	/** First completed topic attempt's score, 0–1. */
	starting_point?: number;
	best?: number;
	latest?: number;
	improvement?: number;
	/** Was the starting point taken before the notes page was first opened? (For teachers.) */
	before_notes?: boolean;
	notes_viewed: boolean;
}

export interface Suggestion {
	kind: 'mistakes' | 'review' | 'weakest' | 'new';
	text: string;
	url: string;
	quiz_id?: string;
}

export interface ExamTechnique extends FigureStatus {
	answers: number;
	credit: number;
	by_format: ({ key: string; credit: number; answers: number } & FigureStatus)[];
	by_command: ({ key: string; credit: number; answers: number } & FigureStatus)[];
	weakest_format: string | null;
	weakest_command: string | null;
}

export interface Pace {
	/** Timed attempts counted (not overtime). */
	attempts: number;
	/** Average share of questions reached, 0–1. */
	reached: number | null;
	seconds_per_mark: number | null;
	target_seconds_per_mark: number;
	latest_score: number;
}

export interface Calibration {
	/** False until there are `needed` rated answers. */
	shown: boolean;
	rated: number;
	needed: number;
	sure?: { answers: number; right: number | null };
	guess?: { answers: number; right: number | null };
	messages: string[];
}

export interface MistakeCounts {
	total: number;
	by_quiz: { quiz_id: string; count: number }[];
}

export interface ProgressData {
	username: string;
	topics: TopicProgress[];
	suggested: Suggestion | null;
	mistakes: MistakeCounts;
	exam_technique: ExamTechnique | null;
	pace: Pace | null;
	calibration: Calibration;
}

/** A quiz in the public index, for topic pickers. */
export interface QuizSummary {
	id: string;
	title: string;
	unit: string;
	page: string;
	/** Can it be used in a topic attempt here? */
	available: boolean;
	/** exam_skill questions servable here, for the "Exam technique" picker. */
	exam_skills: number;
}
