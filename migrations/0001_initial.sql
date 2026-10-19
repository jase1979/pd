-- Initial schema for teachers, teaching groups, students and quiz attempts.
-- Phase 1a doesn't write to any of these yet: anonymous attempts are carried
-- in signed tokens, not stored. Phases 2 and 3 start using them.
--
-- Times are ISO 8601 UTC strings, e.g. '2026-10-19T14:05:00.000Z'.

CREATE TABLE teachers (
	id INTEGER PRIMARY KEY,
	email TEXT UNIQUE NOT NULL,
	name TEXT,
	created_at TEXT
);

-- Not called "groups", because GROUPS is an SQL keyword in SQLite.
CREATE TABLE teaching_groups (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL,
	spec TEXT,                                   -- gcse-legacy | gcse-2026
	owner_teacher_id INTEGER REFERENCES teachers (id),
	retry_cooldown_hours INTEGER DEFAULT 0,
	archived INTEGER DEFAULT 0,
	created_at TEXT
);

CREATE TABLE group_teachers (
	group_id INTEGER REFERENCES teaching_groups (id) ON DELETE CASCADE,
	teacher_id INTEGER REFERENCES teachers (id) ON DELETE CASCADE,
	PRIMARY KEY (group_id, teacher_id)
);

-- A username only: no emails, dates of birth or other personal details.
CREATE TABLE students (
	id INTEGER PRIMARY KEY,
	group_id INTEGER REFERENCES teaching_groups (id) ON DELETE CASCADE,
	username TEXT NOT NULL,
	login_code TEXT UNIQUE NOT NULL,             -- plain text, so teachers can reprint it
	created_at TEXT,
	last_active_at TEXT,
	UNIQUE (group_id, username)
);

-- Only a SHA-256 hash of the session token is stored, never the token itself.
CREATE TABLE sessions (
	token_hash TEXT PRIMARY KEY,
	user_type TEXT CHECK (user_type IN ('student', 'teacher')),
	user_id INTEGER,
	remember INTEGER DEFAULT 0,
	created_at TEXT,
	expires_at TEXT
);

CREATE TABLE attempts (
	id INTEGER PRIMARY KEY,
	student_id INTEGER REFERENCES students (id) ON DELETE CASCADE,
	mode TEXT CHECK (mode IN ('topic', 'mistakes', 'mixed', 'technique', 'timed')),
	quiz_id TEXT NULL,                           -- set for topic mode only
	question_ids TEXT,                           -- JSON array
	score REAL,
	max_score REAL,
	time_limit_s INTEGER NULL,                   -- timed mode only
	time_taken_s INTEGER NULL,
	overtime INTEGER DEFAULT 0,
	started_at TEXT,
	completed_at TEXT                            -- NULL until submitted
);

-- quiz_id, spec_point, concept and command are copied in on purpose, so
-- progress queries work across every mode without needing the quiz bank.
CREATE TABLE attempt_answers (
	attempt_id INTEGER REFERENCES attempts (id) ON DELETE CASCADE,
	question_id TEXT,
	quiz_id TEXT,
	spec_point TEXT,
	concept TEXT,
	command TEXT,
	qtype TEXT,
	skill_format TEXT NULL,                      -- exam_skill format, if any
	chosen TEXT,                                 -- JSON: index, array of indexes, or {answer, reason}
	dont_know INTEGER DEFAULT 0,
	not_reached INTEGER DEFAULT 0,               -- timed mode: ran out of time
	confidence TEXT CHECK (confidence IN ('sure', 'guess')) NULL,
	marks REAL,
	max_marks REAL,
	correct INTEGER                              -- 1 only if full marks
);

CREATE TABLE page_activity (
	student_id INTEGER REFERENCES students (id) ON DELETE CASCADE,
	page_path TEXT,
	first_viewed TEXT,
	last_viewed TEXT,
	view_count INTEGER,
	PRIMARY KEY (student_id, page_path)
);

-- Fixed-window rate limiting, as in visual-tkinter. Replaces the spec's
-- login_attempts table: the key is a SHA-256 hash of scope + IP, so raw IP
-- addresses are never stored. window_start is milliseconds since 1970.
CREATE TABLE rate_limits (
	key TEXT PRIMARY KEY,
	count INTEGER NOT NULL,
	window_start INTEGER NOT NULL
);

CREATE INDEX attempts_student_mode_quiz ON attempts (student_id, mode, quiz_id);
CREATE INDEX attempt_answers_attempt ON attempt_answers (attempt_id);
CREATE INDEX attempt_answers_question ON attempt_answers (question_id);
CREATE INDEX attempt_answers_quiz ON attempt_answers (quiz_id);
CREATE INDEX students_group ON students (group_id);
