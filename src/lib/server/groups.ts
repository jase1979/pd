// Teaching groups and their students, for the teacher pages.
//
// Every function that takes a group or student id checks that the teacher
// can see it (they own the group, or share it via group_teachers), and acts
// as if it doesn't exist otherwise, so ids can't be probed.
//
// Students are a username only. Each gets a permanent login code that only
// changes when a teacher resets it (which also logs them out everywhere).

import { DELETE_REMINDER_MONTHS, MAX_STUDENTS_PER_PASTE, USERNAME_MAX, USERNAME_MIN } from './config';
import { generateCode } from './codes';
import { QuizError } from './quiz/core';
import { endStudentSessions } from './students';
import type { Teacher } from './teachers';

export const SPECS = ['gcse-legacy', 'gcse-2026'] as const;

export interface GroupRow {
	id: number;
	name: string;
	spec: string;
	retry_cooldown_hours: number;
	archived: number;
	created_at: string;
	owner_teacher_id: number;
	students: number;
}

export interface StudentRow {
	id: number;
	username: string;
	login_code: string;
	created_at: string;
	last_active_at: string | null;
}

/** The SQL that limits a query to groups this teacher can see. Bind teacher.id twice. */
const CAN_SEE = `(g.owner_teacher_id = ? OR EXISTS (SELECT 1 FROM group_teachers gt WHERE gt.group_id = g.id AND gt.teacher_id = ?))`;

const GROUP_COLUMNS = `g.id, g.name, g.spec, g.retry_cooldown_hours, g.archived, g.created_at, g.owner_teacher_id,
	(SELECT COUNT(*) FROM students s WHERE s.group_id = g.id) AS students`;

export async function listGroups(db: D1Database, teacher: Teacher): Promise<GroupRow[]> {
	const { results } = await db
		.prepare(`SELECT ${GROUP_COLUMNS} FROM teaching_groups g WHERE ${CAN_SEE} ORDER BY g.archived, g.name`)
		.bind(teacher.id, teacher.id)
		.all<GroupRow>();
	return results;
}

/** The group, if this teacher can see it; otherwise a 404. */
export async function groupFor(db: D1Database, teacher: Teacher, groupId: unknown): Promise<GroupRow> {
	const id = Number(groupId);
	const group = Number.isInteger(id)
		? await db.prepare(`SELECT ${GROUP_COLUMNS} FROM teaching_groups g WHERE g.id = ? AND ${CAN_SEE}`).bind(id, teacher.id, teacher.id).first<GroupRow>()
		: null;
	if (!group) throw new QuizError(404, 'Group not found.');
	return group;
}

/** The student, if this teacher can see their group; otherwise a 404. */
export async function studentFor(db: D1Database, teacher: Teacher, studentId: unknown) {
	const id = Number(studentId);
	const student = Number.isInteger(id)
		? await db
				.prepare(`SELECT s.id, s.username, s.group_id FROM students s JOIN teaching_groups g ON g.id = s.group_id WHERE s.id = ? AND ${CAN_SEE}`)
				.bind(id, teacher.id, teacher.id)
				.first<{ id: number; username: string; group_id: number }>()
		: null;
	if (!student) throw new QuizError(404, 'Student not found.');
	return student;
}

export async function groupStudents(db: D1Database, groupId: number): Promise<StudentRow[]> {
	const { results } = await db
		.prepare('SELECT id, username, login_code, created_at, last_active_at FROM students WHERE group_id = ? ORDER BY username COLLATE NOCASE')
		.bind(groupId)
		.all<StudentRow>();
	return results;
}

// ---- Creating and editing groups ---------------------------------------------------

interface GroupFields {
	name?: unknown;
	spec?: unknown;
	retry_cooldown_hours?: unknown;
	archived?: unknown;
}

/** Validate the fields a teacher can set; throws a 400 naming the problem. */
function checkGroupFields(f: GroupFields, creating: boolean) {
	const out: { name?: string; spec?: string; retry_cooldown_hours?: number; archived?: number } = {};
	if (f.name !== undefined || creating) {
		const name = typeof f.name === 'string' ? f.name.trim() : '';
		if (!name || name.length > 60) throw new QuizError(400, 'Give the group a name of up to 60 characters.');
		out.name = name;
	}
	if (f.spec !== undefined || creating) {
		const spec = f.spec ?? 'gcse-legacy';
		if (!SPECS.includes(spec as never)) throw new QuizError(400, `The spec should be one of: ${SPECS.join(', ')}.`);
		out.spec = spec as string;
	}
	if (f.retry_cooldown_hours !== undefined) {
		const h = Number(f.retry_cooldown_hours);
		if (!Number.isInteger(h) || h < 0 || h > 24 * 14) throw new QuizError(400, 'The cooldown should be a whole number of hours, from 0 to 336.');
		out.retry_cooldown_hours = h;
	}
	if (f.archived !== undefined) out.archived = f.archived ? 1 : 0;
	return out;
}

export async function createGroup(db: D1Database, teacher: Teacher, fields: GroupFields, now = Date.now()) {
	const f = checkGroupFields(fields, true);
	const row = await db
		.prepare('INSERT INTO teaching_groups (name, spec, owner_teacher_id, retry_cooldown_hours, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
		.bind(f.name, f.spec, teacher.id, f.retry_cooldown_hours ?? 0, new Date(now).toISOString())
		.first<{ id: number }>();
	await db.prepare('INSERT INTO group_teachers (group_id, teacher_id) VALUES (?, ?)').bind(row!.id, teacher.id).run();
	return groupFor(db, teacher, row!.id);
}

export async function updateGroup(db: D1Database, teacher: Teacher, groupId: unknown, fields: GroupFields) {
	const group = await groupFor(db, teacher, groupId);
	const f = checkGroupFields(fields, false);
	const sets = Object.keys(f);
	if (sets.length === 0) return group;
	await db
		.prepare(`UPDATE teaching_groups SET ${sets.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
		.bind(...sets.map((k) => f[k as keyof typeof f]), group.id)
		.run();
	return groupFor(db, teacher, group.id);
}

/**
 * Permanently delete a group with all its students, attempts, answers and
 * page activity. The teacher must type the group's name exactly to confirm.
 */
export async function deleteGroup(db: D1Database, teacher: Teacher, groupId: unknown, confirmName: unknown) {
	const group = await groupFor(db, teacher, groupId);
	if (typeof confirmName !== 'string' || confirmName.trim() !== group.name) {
		throw new QuizError(400, `To delete this group, type its name exactly: ${group.name}`);
	}
	// Sessions aren't linked to students by a foreign key, so end them first.
	// Everything else goes with the group (ON DELETE CASCADE in the migration).
	await db.batch([
		db.prepare("DELETE FROM sessions WHERE user_type = 'student' AND user_id IN (SELECT id FROM students WHERE group_id = ?)").bind(group.id),
		db.prepare('DELETE FROM teaching_groups WHERE id = ?').bind(group.id)
	]);
}

/** Groups to remind the teacher to delete: archived, or created DELETE_REMINDER_MONTHS or more ago. */
export function needsDeleting(group: Pick<GroupRow, 'archived' | 'created_at'>, now = Date.now()): boolean {
	if (group.archived) return true;
	const cutoff = new Date(now);
	cutoff.setUTCMonth(cutoff.getUTCMonth() - DELETE_REMINDER_MONTHS);
	return Date.parse(group.created_at) <= cutoff.getTime();
}

// ---- Adding students from a pasted list ---------------------------------------------

export interface PastePreview {
	/** Will be created. */
	create: string[];
	skip: { username: string; reason: string }[];
}

/**
 * Turn pasted text into usernames: one per line, or a CSV with a "username"
 * column. Trims whitespace, ignores blank lines, removes duplicates (ignoring
 * case) and checks length. Pure, so it's easy to test.
 */
export function parseUsernames(text: string): PastePreview {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	let values = lines;

	// A CSV with a header row: use its username column.
	const header = splitCsvLine(lines.find((l) => l.trim()) ?? '').map((h) => h.trim().toLowerCase());
	const col = header.indexOf('username');
	if (header.length > 1 && col >= 0) {
		const first = lines.findIndex((l) => l.trim());
		values = lines.slice(first + 1).map((l) => splitCsvLine(l)[col] ?? '');
	}

	const create: string[] = [];
	const skip: PastePreview['skip'] = [];
	const seen = new Set<string>();
	for (const raw of values) {
		const username = raw.trim();
		if (!username) continue;
		if (seen.has(username.toLowerCase())) {
			skip.push({ username, reason: 'appears more than once in the list' });
			continue;
		}
		seen.add(username.toLowerCase());
		if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
			skip.push({ username, reason: `must be ${USERNAME_MIN}–${USERNAME_MAX} characters` });
		} else {
			create.push(username);
		}
	}
	return { create, skip };
}

/** One CSV line into fields, allowing "quoted, fields". */
function splitCsvLine(line: string): string[] {
	const out: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (quoted) {
			if (c === '"' && line[i + 1] === '"') (field += '"'), i++;
			else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') out.push(field), (field = '');
		else field += c;
	}
	out.push(field);
	return out;
}

/** What a paste would do to this group, before anything is created. */
export async function previewStudents(db: D1Database, teacher: Teacher, groupId: unknown, text: unknown): Promise<PastePreview> {
	const group = await groupFor(db, teacher, groupId);
	if (typeof text !== 'string') throw new QuizError(400, 'Paste the usernames, one per line.');
	const parsed = parseUsernames(text);
	const existing = new Set((await groupStudents(db, group.id)).map((s) => s.username.toLowerCase()));
	const create: string[] = [];
	const skip = [...parsed.skip];
	for (const u of parsed.create) {
		if (existing.has(u.toLowerCase())) skip.push({ username: u, reason: 'is already in this group' });
		else create.push(u);
	}
	if (create.length > MAX_STUDENTS_PER_PASTE) {
		throw new QuizError(400, `That's ${create.length} students. Add at most ${MAX_STUDENTS_PER_PASTE} at a time.`);
	}
	return { create, skip };
}

/**
 * Create the students from a confirmed preview, each with a new permanent
 * code, in one batch. The list is checked again here: the preview is only
 * what the teacher saw.
 */
export async function addStudents(db: D1Database, teacher: Teacher, groupId: unknown, usernames: unknown, now = Date.now()) {
	if (!Array.isArray(usernames) || !usernames.every((u) => typeof u === 'string')) {
		throw new QuizError(400, 'usernames should be a list.');
	}
	const preview = await previewStudents(db, teacher, groupId, usernames.join('\n'));
	if (preview.create.length === 0) return { created: [] as { username: string; code: string }[], skip: preview.skip };

	const codes = await uniqueCodes(db, preview.create.length);
	const at = new Date(now).toISOString();
	const gid = Number(groupId);
	await db.batch(
		preview.create.map((u, i) =>
			db.prepare('INSERT INTO students (group_id, username, login_code, created_at) VALUES (?, ?, ?, ?)').bind(gid, u, codes[i], at)
		)
	);
	return { created: preview.create.map((username, i) => ({ username, code: codes[i] })), skip: preview.skip };
}

/** `n` new codes that no student has, and that are all different. */
async function uniqueCodes(db: D1Database, n: number): Promise<string[]> {
	const out = new Set<string>();
	for (let tries = 0; out.size < n; tries++) {
		if (tries > n + 20) throw new Error('Could not generate unique login codes');
		const candidates = Array.from({ length: n - out.size }, generateCode).filter((c) => !out.has(c));
		const placeholders = candidates.map(() => '?').join(',');
		const { results } = await db.prepare(`SELECT login_code FROM students WHERE login_code IN (${placeholders})`).bind(...candidates).all<{ login_code: string }>();
		const taken = new Set(results.map((r) => r.login_code));
		for (const c of candidates) if (!taken.has(c)) out.add(c);
	}
	return [...out];
}

// ---- Students -------------------------------------------------------------------------

/** Rename and/or move a student. Moving keeps their code and history. */
export async function updateStudent(db: D1Database, teacher: Teacher, studentId: unknown, f: { username?: unknown; group_id?: unknown }) {
	const student = await studentFor(db, teacher, studentId);
	let username = student.username;
	let groupId = student.group_id;
	if (f.username !== undefined) {
		const parsed = typeof f.username === 'string' ? parseUsernames(f.username) : { create: [] };
		if (parsed.create.length !== 1) throw new QuizError(400, `A username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`);
		username = parsed.create[0];
	}
	if (f.group_id !== undefined) groupId = (await groupFor(db, teacher, f.group_id)).id; // must be able to see the new group too
	const clash = await db
		.prepare('SELECT 1 FROM students WHERE group_id = ? AND username = ? COLLATE NOCASE AND id != ?')
		.bind(groupId, username, student.id)
		.first();
	if (clash) throw new QuizError(409, `There's already a student called ${username} in that group.`);
	await db.prepare('UPDATE students SET username = ?, group_id = ? WHERE id = ?').bind(username, groupId, student.id).run();
	return { id: student.id, username, group_id: groupId };
}

/** Remove a student and everything they've done. */
export async function removeStudent(db: D1Database, teacher: Teacher, studentId: unknown) {
	const student = await studentFor(db, teacher, studentId);
	await db.batch([
		db.prepare("DELETE FROM sessions WHERE user_type = 'student' AND user_id = ?").bind(student.id),
		db.prepare('DELETE FROM students WHERE id = ?').bind(student.id)
	]);
}

/** Give a student a new code. The old one stops working at once, and they're logged out everywhere. */
export async function resetCode(db: D1Database, teacher: Teacher, studentId: unknown) {
	const student = await studentFor(db, teacher, studentId);
	const [code] = await uniqueCodes(db, 1);
	await db.prepare('UPDATE students SET login_code = ? WHERE id = ?').bind(code, student.id).run();
	await endStudentSessions(db, student.id);
	return { id: student.id, code };
}

// ---- Exports ----------------------------------------------------------------------------

/**
 * One CSV field. Quoted when needed, and a leading = + - @ is defused so a
 * spreadsheet can't run a username as a formula.
 */
export function csvField(value: string): string {
	const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csv(rows: string[][]): string {
	return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

// ---- Sharing a group between teachers ------------------------------------------------

export interface GroupTeacher {
	id: number;
	email: string;
	owner: boolean;
}

export async function groupTeachers(db: D1Database, teacher: Teacher, groupId: unknown): Promise<GroupTeacher[]> {
	const group = await groupFor(db, teacher, groupId);
	const { results } = await db
		.prepare(
			`SELECT t.id, t.email FROM teachers t
			 WHERE t.id = ? OR t.id IN (SELECT teacher_id FROM group_teachers WHERE group_id = ?)
			 ORDER BY t.email`
		)
		.bind(group.owner_teacher_id, group.id)
		.all<{ id: number; email: string }>();
	return results.map((t) => ({ ...t, owner: t.id === group.owner_teacher_id }));
}

/**
 * Give another teacher access to the group. They see it when they sign in
 * (their address still has to be allowed to sign in). Anyone with access can
 * share a group.
 */
export async function shareGroup(db: D1Database, teacher: Teacher, groupId: unknown, email: string, now = Date.now()) {
	const group = await groupFor(db, teacher, groupId);
	await db.prepare('INSERT INTO teachers (email, created_at) VALUES (?, ?) ON CONFLICT (email) DO NOTHING').bind(email, new Date(now).toISOString()).run();
	await db
		.prepare('INSERT INTO group_teachers (group_id, teacher_id) SELECT ?, id FROM teachers WHERE email = ? ON CONFLICT DO NOTHING')
		.bind(group.id, email)
		.run();
	return groupTeachers(db, teacher, group.id);
}

/** Take a teacher's access away. The owner can remove anyone else; others can only remove themselves. */
export async function unshareGroup(db: D1Database, teacher: Teacher, groupId: unknown, teacherId: unknown) {
	const group = await groupFor(db, teacher, groupId);
	const target = Number(teacherId);
	if (target === group.owner_teacher_id) throw new QuizError(400, "The group's owner can't be removed. Delete the group instead.");
	if (teacher.id !== group.owner_teacher_id && target !== teacher.id) {
		throw new QuizError(403, "Only the group's owner can remove other teachers.");
	}
	await db.prepare('DELETE FROM group_teachers WHERE group_id = ? AND teacher_id = ?').bind(group.id, target).run();
}
