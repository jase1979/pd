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
