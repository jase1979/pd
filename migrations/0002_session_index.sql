-- Ending all of a student's sessions (logout everywhere, code reset) looks
-- sessions up by student rather than by token.
CREATE INDEX sessions_user ON sessions (user_type, user_id);
