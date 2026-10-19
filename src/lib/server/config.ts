// Every threshold and tunable number for the quiz platform, in one place.
// These are starting values, not research findings: adjust them after a term
// of real use. Anything the browser needs from here is sent by the API rather
// than copied into front-end code.

/** Values of ENVIRONMENT in which draft questions are served as well as reviewed ones. */
// 'preview' is included so the pilot (all drafts) can be tried on a preview
// deployment before any question is reviewed. Remove it to make previews
// behave exactly like the live site.
export const DRAFTS_SERVED_IN = ['dev', 'preview'];

/** A quiz that can't serve at least this many questions is hidden. */
// Applies after the one-question-per-concept rule, so a quiz needs at least
// this many distinct (servable) concepts to appear at all.
export const MIN_QUESTIONS_PER_ATTEMPT = 5;

/** How long an anonymous attempt token stays valid, in seconds. */
export const ANON_TOKEN_TTL_S = 2 * 60 * 60; // 2 hours

/** exam_skill questions per topic attempt, when a quiz file doesn't set exam_skills_per_attempt. */
export const DEFAULT_EXAM_SKILLS_PER_ATTEMPT = 2;

// Build warnings (they don't fail the build). See quiz-report.md for the details.
/** A topic's quiz should build up to at least this many reviewed questions. */
export const TARGET_REVIEWED_QUESTIONS = 20;
/** ...and at least this many reviewed exam_skill questions. */
export const TARGET_REVIEWED_EXAM_SKILLS = 3;
/** ...with at least this share of questions set in a product context. */
export const TARGET_CONTEXT_SHARE = 0.5;
/** Explanations and why_wrong longer than this (in characters) get a warning. */
export const MAX_EXPLANATION_LENGTH = 300;
