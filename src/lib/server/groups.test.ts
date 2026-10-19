import { describe, expect, it } from 'vitest';
import {
	addStudents,
	createGroup,
	csv,
	deleteGroup,
	groupFor,
	groupStudents,
	listGroups,
	needsDeleting,
	parseUsernames,
	previewStudents,
	removeStudent,
	resetCode,
	updateGroup,
	updateStudent
} from './groups';
import { createSession, loginWithCode, studentForToken } from './students';
import { teacherByEmail } from './teachers';
import { testDb } from './testing/d1';

const now = Date.UTC(2026, 9, 19, 8);

async function setup() {
	const db = testDb();
	const jones = await teacherByEmail(db, 'jones@school.org');
	const patel = await teacherByEmail(db, 'patel@school.org');
	const group = await createGroup(db, jones, { name: '10X', spec: 'gcse-legacy' }, now);
	return { db, jones, patel, group };
}

describe('parseUsernames', () => {
	it('trims, ignores blank lines and removes duplicates (ignoring case)', () => {
		expect(parseUsernames('  amy \n\nben\r\nAMY\n\t\ncal  ')).toEqual({
			create: ['amy', 'ben', 'cal'],
			skip: [{ username: 'AMY', reason: 'appears more than once in the list' }]
		});
	});

	it('checks the length is 1–50 characters', () => {
		const long = 'x'.repeat(51);
		expect(parseUsernames(`${'y'.repeat(50)}\n${long}`)).toEqual({
			create: ['y'.repeat(50)],
			skip: [{ username: long, reason: 'must be 1–50 characters' }]
		});
	});

	it('takes the username column from a CSV with a header row', () => {
		const text = 'First name,Username,Form\nAmy,"amy.b",10X\nBen,ben.c,10X\n';
		expect(parseUsernames(text).create).toEqual(['amy.b', 'ben.c']);
	});

	it('treats a single-column list with a "username" line as just a list', () => {
		expect(parseUsernames('username\namy').create).toEqual(['username', 'amy']);
	});
});

describe('teachers only see their own groups', () => {
	it('lists only groups the teacher owns or shares', async () => {
		const { db, jones, patel } = await setup();
		await createGroup(db, patel, { name: '11Y' }, now);
		expect((await listGroups(db, jones)).map((g) => g.name)).toEqual(['10X']);
		expect((await listGroups(db, patel)).map((g) => g.name)).toEqual(['11Y']);
	});

	it("can't view, edit, delete or add to someone else's group", async () => {
		const { db, patel, group } = await setup();
		const notFound = { status: 404 };
		await expect(groupFor(db, patel, group.id)).rejects.toMatchObject(notFound);
		await expect(updateGroup(db, patel, group.id, { name: 'Mine' })).rejects.toMatchObject(notFound);
		await expect(deleteGroup(db, patel, group.id, '10X')).rejects.toMatchObject(notFound);
		await expect(previewStudents(db, patel, group.id, 'amy')).rejects.toMatchObject(notFound);
		await expect(addStudents(db, patel, group.id, ['amy'])).rejects.toMatchObject(notFound);
	});

	it("can't touch someone else's students", async () => {
		const { db, jones, patel, group } = await setup();
		await addStudents(db, jones, group.id, ['amy'], now);
		const [amy] = await groupStudents(db, group.id);
		const notFound = { status: 404 };
		await expect(resetCode(db, patel, amy.id)).rejects.toMatchObject(notFound);
		await expect(removeStudent(db, patel, amy.id)).rejects.toMatchObject(notFound);
		await expect(updateStudent(db, patel, amy.id, { username: 'x' })).rejects.toMatchObject(notFound);
	});

	it('sees a group shared with them', async () => {
		const { db, patel, group } = await setup();
		await db.prepare('INSERT INTO group_teachers (group_id, teacher_id) VALUES (?, ?)').bind(group.id, patel.id).run();
		expect((await groupFor(db, patel, group.id)).name).toBe('10X');
	});
});

describe('groups', () => {
	it('can be renamed, have a cooldown set and be archived', async () => {
		const { db, jones, group } = await setup();
		const g = await updateGroup(db, jones, group.id, { name: ' 10X Product Design ', retry_cooldown_hours: 24, archived: true });
		expect(g).toMatchObject({ name: '10X Product Design', retry_cooldown_hours: 24, archived: 1 });
	});

	it.each([
		[{ name: '' }, /name/],
		[{ spec: 'a-level' }, /spec/],
		[{ retry_cooldown_hours: -1 }, /cooldown/],
		[{ retry_cooldown_hours: 2.5 }, /cooldown/]
	])('rejects %j', async (fields, pattern) => {
		const { db, jones, group } = await setup();
		await expect(updateGroup(db, jones, group.id, fields)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(pattern) });
	});

	it('are only deleted when the name is typed exactly, and take everything with them', async () => {
		const { db, jones, group } = await setup();
		await addStudents(db, jones, group.id, ['amy', 'ben'], now);
		const [amy] = await groupStudents(db, group.id);
		const { token } = await createSession(db, amy.id, true, now);
		await db.prepare("INSERT INTO attempts (student_id, mode, question_ids, started_at, completed_at) VALUES (?, 'topic', '[]', 'x', 'y')").bind(amy.id).run();
		await db.prepare("INSERT INTO attempt_answers (attempt_id, question_id) VALUES (1, 'q')").run();
		await db.prepare("INSERT INTO page_activity (student_id, page_path, view_count) VALUES (?, '/gcse/', 1)").bind(amy.id).run();

		await expect(deleteGroup(db, jones, group.id, '10x')).rejects.toMatchObject({ status: 400 });
		await deleteGroup(db, jones, group.id, '10X');

		for (const table of ['teaching_groups', 'group_teachers', 'students', 'attempts', 'attempt_answers', 'page_activity', 'sessions']) {
			const { n } = (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!;
			expect(n, table).toBe(0);
		}
		expect(await studentForToken(db, token, now)).toBeNull();
	});

	it('remind the teacher to delete them after 12 months, or once archived', () => {
		const created = (months: number) => {
			const d = new Date(now);
			d.setUTCMonth(d.getUTCMonth() - months);
			return d.toISOString();
		};
		expect(needsDeleting({ archived: 0, created_at: created(11) }, now)).toBe(false);
		expect(needsDeleting({ archived: 0, created_at: created(12) }, now)).toBe(true);
		expect(needsDeleting({ archived: 1, created_at: created(0) }, now)).toBe(true);
	});
});

describe('adding students', () => {
	it('previews what will be created and what skipped, with reasons', async () => {
		const { db, jones, group } = await setup();
		await addStudents(db, jones, group.id, ['amy'], now);
		const preview = await previewStudents(db, jones, group.id, 'Amy\nben\nben\n\n' + 'z'.repeat(60));
		expect(preview).toEqual({
			create: ['ben'],
			skip: [
				{ username: 'ben', reason: 'appears more than once in the list' },
				{ username: 'z'.repeat(60), reason: 'must be 1–50 characters' },
				{ username: 'Amy', reason: 'is already in this group' }
			]
		});
	});

	it('gives every new student a unique permanent code', async () => {
		const { db, jones, group } = await setup();
		const names = Array.from({ length: 40 }, (_, i) => `student${i}`);
		const { created } = await addStudents(db, jones, group.id, names, now);
		expect(created).toHaveLength(40);
		expect(new Set(created.map((c) => c.code)).size).toBe(40);
		for (const c of created) expect(c.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
		// The code logs them in.
		const r = await loginWithCode(db, { code: created[0].code, remember: false, ip: '1.2.3.4', now });
		expect(r.ok && r.student.username).toBe('student0');
	});

	it('checks the list again on confirm, rather than trusting the preview', async () => {
		const { db, jones, group } = await setup();
		await addStudents(db, jones, group.id, ['amy'], now);
		const { created, skip } = await addStudents(db, jones, group.id, ['amy', 'ben', ''], now);
		expect(created.map((c) => c.username)).toEqual(['ben']);
		expect(skip).toEqual([{ username: 'amy', reason: 'is already in this group' }]);
	});

	it('allows the same username in two different groups', async () => {
		const { db, jones, group } = await setup();
		const other = await createGroup(db, jones, { name: '10Y' }, now);
		await addStudents(db, jones, group.id, ['amy'], now);
		const { created } = await addStudents(db, jones, other.id, ['amy'], now);
		expect(created).toHaveLength(1);
	});
});

describe('students', () => {
	it('keep their code and history when moved to another group', async () => {
		const { db, jones, group } = await setup();
		const other = await createGroup(db, jones, { name: '10Y' }, now);
		const { created } = await addStudents(db, jones, group.id, ['amy'], now);
		const [amy] = await groupStudents(db, group.id);
		await db.prepare("INSERT INTO attempts (student_id, mode, question_ids, started_at) VALUES (?, 'topic', '[]', 'x')").bind(amy.id).run();
		await updateStudent(db, jones, amy.id, { group_id: other.id });
		const [moved] = await groupStudents(db, other.id);
		expect(moved).toMatchObject({ id: amy.id, login_code: created[0].code });
		expect((await db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE student_id = ?').bind(amy.id).first<{ n: number }>())!.n).toBe(1);
	});

	it("can't be moved into a group the teacher can't see, or onto a taken username", async () => {
		const { db, jones, patel, group } = await setup();
		const theirs = await createGroup(db, patel, { name: '11Y' }, now);
		await addStudents(db, jones, group.id, ['amy', 'ben'], now);
		const [amy] = await groupStudents(db, group.id);
		await expect(updateStudent(db, jones, amy.id, { group_id: theirs.id })).rejects.toMatchObject({ status: 404 });
		await expect(updateStudent(db, jones, amy.id, { username: 'BEN' })).rejects.toMatchObject({ status: 409 });
	});

	it('get a new code on reset: the old one stops working and they are logged out', async () => {
		const { db, jones, group } = await setup();
		const { created } = await addStudents(db, jones, group.id, ['amy'], now);
		const login = await loginWithCode(db, { code: created[0].code, remember: true, ip: '1.2.3.4', now });
		if (!login.ok) throw new Error('login failed');
		const [amy] = await groupStudents(db, group.id);
		const { code } = await resetCode(db, jones, amy.id);
		expect(code).not.toBe(created[0].code);
		expect(await studentForToken(db, login.token, now)).toBeNull();
		expect((await loginWithCode(db, { code: created[0].code, remember: false, ip: '1.2.3.4', now })).ok).toBe(false);
		expect((await loginWithCode(db, { code, remember: false, ip: '1.2.3.4', now })).ok).toBe(true);
	});

	it('are removed with everything they did', async () => {
		const { db, jones, group } = await setup();
		await addStudents(db, jones, group.id, ['amy', 'ben'], now);
		const [amy] = await groupStudents(db, group.id);
		await db.prepare("INSERT INTO attempts (student_id, mode, question_ids, started_at) VALUES (?, 'topic', '[]', 'x')").bind(amy.id).run();
		await removeStudent(db, jones, amy.id);
		expect((await groupStudents(db, group.id)).map((s) => s.username)).toEqual(['ben']);
		expect((await db.prepare('SELECT COUNT(*) AS n FROM attempts').first<{ n: number }>())!.n).toBe(0);
	});
});

describe('CSV export', () => {
	it('quotes fields that need it and defuses spreadsheet formulas', () => {
		expect(csv([['username', 'code'], ['amy, b', 'K7MP-Q2XA'], ['=HYPERLINK("x")', 'AAAA-BBBB'], ['-1', 'x']])).toBe(
			'username,code\r\n"amy, b",K7MP-Q2XA\r\n"\'=HYPERLINK(""x"")",AAAA-BBBB\r\n\'-1,x\r\n'
		);
	});
});
