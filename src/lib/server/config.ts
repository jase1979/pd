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

// ---- Students: login and sessions -------------------------------------------

/** How long a login lasts on the server when "Remember me" is NOT ticked, in hours. */
// The cookie itself has no expiry, so the browser also forgets it when closed:
// students often share school computers.
export const SESSION_HOURS = 12;
/** How long a "Remember me on this device" login lasts (cookie and server), in days. */
export const REMEMBER_DAYS = 7;
/** Failed code logins allowed from one IP address within LOGIN_BLOCK_MINUTES. */
// A whole class shares the school's IP address and some typing mistakes are
// expected, so this is high. With 31^8 (about 850 billion) possible codes,
// 100 guesses per 15 minutes still makes guessing a valid code impractical.
// Successful logins never count.
export const LOGIN_MAX_FAILURES = 100;
export const LOGIN_BLOCK_MINUTES = 15;

// ---- Practice modes -----------------------------------------------------------

/** Calendar days are counted in this time zone (for the "later day" mistakes rule). */
export const TIME_ZONE = 'Europe/London';
/** Questions in "Practise my mistakes". */
export const MISTAKES_PER_ATTEMPT = 10;
/** Knowledge questions in "Mixed review" (plus DEFAULT_EXAM_SKILLS_PER_ATTEMPT exam_skill ones). */
export const MIXED_PER_ATTEMPT = 10;
/** exam_skill questions in "Exam technique". */
export const TECHNIQUE_PER_ATTEMPT = 10;
/** Questions in "Timed practice", of which up to TIMED_MAX_EXAM_SKILLS are exam_skill. */
export const TIMED_PER_ATTEMPT = 20;
export const TIMED_MAX_EXAM_SKILLS = 4;
/** Timed practice allows this many seconds per mark. */
export const SECONDS_PER_MARK = 45;
/** A timed attempt submitted more than this many seconds after its limit is flagged overtime. */
export const OVERTIME_GRACE_S = 30;
/** Mixed review weighting: weight = (1 − mastery) + min(days since practised / this, 1). */
export const MIXED_RECENCY_DAYS = 28;
/** ...but never less than this, so every topic can still come up. */
export const MIXED_MIN_WEIGHT = 0.1;
/** Mixed review avoids questions answered within this many hours, where it can. */
export const AVOID_RECENT_HOURS = 24;

// ---- Progress -----------------------------------------------------------------

/** Secure: mastery and concept coverage at least these, and the spacing rule met. */
export const SECURE_MASTERY = 0.8;
export const SECURE_COVERAGE = 0.8;
/** Getting there: mastery at least this. Below it is "Not secure yet". */
export const GETTING_THERE_MASTERY = 0.5;
/** Spacing rule: the counted answers must include two at least this many hours apart. */
export const SPACING_HOURS = 20;
/** A Secure topic not practised for this many days shows as "Getting there — due for review". */
export const REVIEW_DUE_DAYS = 28;
/** Exam technique figures use the latest this-many exam_skill answers. */
export const EXAM_TECHNIQUE_LATEST = 20;
/** Calibration is shown once there are at least this many Sure/Guessing answers. */
export const CALIBRATION_MIN_RATED = 20;
/** "When you say you're sure, you're usually right": Sure answers right at least this often. */
export const CALIBRATION_SURE_GOOD = 0.85;
/** "You're often sure about answers that turn out wrong": Sure answers right less often than this. */
export const CALIBRATION_SURE_POOR = 0.7;
/** "You know more than you think": at least this many Guessing answers... */
export const CALIBRATION_GUESS_MIN = 10;
/** ...and at least this share of them right. */
export const CALIBRATION_GUESS_GOOD = 0.6;

// ---- Teachers -------------------------------------------------------------------

/** A sign-in link emailed to a teacher works for this many minutes, once. */
export const MAGIC_LINK_MINUTES = 15;
/** Sign-in emails per address, and per IP address, within LINK_LIMIT_MINUTES. */
export const LINK_LIMIT_PER_EMAIL = 3;
export const LINK_LIMIT_PER_IP = 20;
export const LINK_LIMIT_MINUTES = 15;
/** Teacher sessions follow the student rules: SESSION_HOURS, or REMEMBER_DAYS with "Remember me". */

/** The year-end reminder shows any group created at least this many months ago (and every archived group). */
export const DELETE_REMINDER_MONTHS = 12;
/** Pasted usernames must be this many characters long. */
export const USERNAME_MIN = 1;
export const USERNAME_MAX = 50;
/** Most students that can be added in one paste. */
export const MAX_STUDENTS_PER_PASTE = 200;
/** Failed teacher password sign-ins allowed per IP address within LOGIN_BLOCK_MINUTES. */
export const TEACHER_PASSWORD_MAX_FAILURES = 10;
/** PBKDF2 rounds for the teacher password hash (100,000 is the most Cloudflare Workers allow). */
export const PASSWORD_HASH_ITERATIONS = 100_000;
