-- Work a teacher sets a group, with a due date (Phase 5).
--   kind 'topic'             one topic quiz (quiz_id)
--   kind 'mixed'             a mixed quiz on chosen topics (topics, JSON array of quiz ids)
--   kind 'weak_spec_points'  a review of the group's weakest spec points, fixed
--                            when the work is set (spec_points, JSON array)
-- An assessment allows one attempt per student, with no "Try again now".
CREATE TABLE assignments (
	id INTEGER PRIMARY KEY,
	group_id INTEGER NOT NULL REFERENCES teaching_groups (id) ON DELETE CASCADE,
	created_by INTEGER REFERENCES teachers (id) ON DELETE SET NULL,
	title TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('topic', 'mixed', 'weak_spec_points')),
	quiz_id TEXT,
	topics TEXT,
	spec_points TEXT,
	assessment INTEGER NOT NULL DEFAULT 0,
	due_date TEXT NOT NULL,                      -- YYYY-MM-DD, due by the end of that day (UK time)
	created_at TEXT NOT NULL
);
CREATE INDEX assignments_group ON assignments (group_id);

-- Which set work an attempt was for, if any.
ALTER TABLE attempts ADD COLUMN assignment_id INTEGER REFERENCES assignments (id) ON DELETE SET NULL;
CREATE INDEX attempts_assignment ON attempts (assignment_id, student_id);
