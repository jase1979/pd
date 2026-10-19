// A student's saved history, read from D1. Everything the progress figures,
// mistakes list and question selection need comes from these three queries;
// the calculations themselves are plain functions in progress.ts, so they can
// be tested without a database.
//
// Only COMPLETED attempts count, everywhere: an attempt started but never
// submitted (e.g. the tab was closed) is ignored.

export interface AnswerRow {
	attempt_id: number;
	mode: 'topic' | 'mistakes' | 'mixed' | 'technique' | 'timed';
	/** When the attempt was submitted (ISO). Every answer in an attempt shares it. */
	answered_at: string;
	question_id: string;
	quiz_id: string;
	spec_point: string;
	concept: string;
	command: string;
	qtype: string;
	skill_format: string | null;
	dont_know: number;
	not_reached: number;
	confidence: 'sure' | 'guess' | null;
	marks: number;
	max_marks: number;
	correct: number;
}

export interface AttemptRow {
	id: number;
	mode: AnswerRow['mode'];
	quiz_id: string | null;
	score: number;
	max_score: number;
	question_count: number;
	time_limit_s: number | null;
	time_taken_s: number | null;
	overtime: number;
	started_at: string;
	completed_at: string;
}

export interface PageRow {
	page_path: string;
	first_viewed: string;
	last_viewed: string;
	view_count: number;
}

export interface History {
	/** Oldest first. */
	answers: AnswerRow[];
	/** Oldest first. */
	attempts: AttemptRow[];
	pages: PageRow[];
}

export async function loadHistory(db: D1Database, studentId: number): Promise<History> {
	const [answers, attempts, pages] = await Promise.all([
		db
			.prepare(
				`SELECT aa.attempt_id, a.mode, a.completed_at AS answered_at, aa.question_id, aa.quiz_id,
				        aa.spec_point, aa.concept, aa.command, aa.qtype, aa.skill_format, aa.dont_know,
				        aa.not_reached, aa.confidence, aa.marks, aa.max_marks, aa.correct
				 FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
				 WHERE a.student_id = ? AND a.completed_at IS NOT NULL
				 ORDER BY a.completed_at, aa.rowid`
			)
			.bind(studentId)
			.all<AnswerRow>(),
		db
			.prepare(
				`SELECT id, mode, quiz_id, score, max_score, json_array_length(question_ids) AS question_count,
				        time_limit_s, time_taken_s, overtime, started_at, completed_at
				 FROM attempts
				 WHERE student_id = ? AND completed_at IS NOT NULL
				 ORDER BY completed_at`
			)
			.bind(studentId)
			.all<AttemptRow>(),
		db
			.prepare('SELECT page_path, first_viewed, last_viewed, view_count FROM page_activity WHERE student_id = ?')
			.bind(studentId)
			.all<PageRow>()
	]);
	return { answers: answers.results, attempts: attempts.results, pages: pages.results };
}

/** When the student may next start this topic quiz, or null if there's no cooldown now. */
export async function cooldownUntil(db: D1Database, studentId: number, groupId: number, quizId: string, now = Date.now()) {
	const row = await db
		.prepare(
			`SELECT g.retry_cooldown_hours AS hours,
			        (SELECT MAX(completed_at) FROM attempts
			         WHERE student_id = ? AND mode = 'topic' AND quiz_id = ? AND completed_at IS NOT NULL) AS last
			 FROM teaching_groups g WHERE g.id = ?`
		)
		.bind(studentId, quizId, groupId)
		.first<{ hours: number | null; last: string | null }>();
	if (!row?.hours || !row.last) return null;
	const until = Date.parse(row.last) + row.hours * 3600_000;
	return until > now ? new Date(until) : null;
}

/** Record a notes-page view (first view, last view and count). */
export async function trackPage(db: D1Database, studentId: number, path: string, now = Date.now()) {
	const at = new Date(now).toISOString();
	await db
		.prepare(
			`INSERT INTO page_activity (student_id, page_path, first_viewed, last_viewed, view_count)
			 VALUES (?1, ?2, ?3, ?3, 1)
			 ON CONFLICT (student_id, page_path) DO UPDATE SET last_viewed = ?3, view_count = view_count + 1`
		)
		.bind(studentId, path, at)
		.run();
}
