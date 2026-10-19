-- Teachers sign in with a link emailed to them (no passwords). Only a
-- SHA-256 hash of each link's token is stored. A link works once, and only
-- for MAGIC_LINK_MINUTES (src/lib/server/config.ts).
CREATE TABLE magic_links (
	token_hash TEXT PRIMARY KEY,
	email TEXT NOT NULL,
	remember INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	consumed_at TEXT
);
CREATE INDEX magic_links_email ON magic_links (email);
CREATE INDEX group_teachers_teacher ON group_teachers (teacher_id);
