// A stand-in for Cloudflare D1 in the unit tests, backed by Node's built-in
// SQLite with the real migrations applied, so the tests exercise the actual
// SQL. Only the parts of the D1 API this project uses are implemented.
//
// Test-only: nothing outside *.test.ts files imports this.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { generateCode } from '../codes';

type Value = string | number | null | boolean | undefined;

class Statement {
	constructor(
		private db: DatabaseSync,
		private sql: string,
		private params: Value[] = []
	) {}

	bind(...params: Value[]) {
		return new Statement(this.db, this.sql, params);
	}

	/**
	 * The SQL and values node:sqlite can run. D1 turns booleans into 1/0 and
	 * undefined into NULL, and accepts numbered parameters (?1, ?2) bound by
	 * position; node:sqlite does none of these, so they're converted here.
	 */
	private compiled(): [string, SQLInputValue[]] {
		const params = this.params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));
		if (!/\?\d/.test(this.sql)) return [this.sql, params];
		const values: SQLInputValue[] = [];
		const sql = this.sql.replace(/\?(\d+)/g, (_, n) => {
			values.push(params[Number(n) - 1]);
			return '?';
		});
		return [sql, values];
	}

	async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
		const [sql, values] = this.compiled();
		const row = this.db.prepare(sql).get(...values) as Record<string, unknown> | undefined;
		if (!row) return null;
		return (column ? row[column] : { ...row }) as T;
	}

	async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
		const [sql, values] = this.compiled();
		const rows = this.db.prepare(sql).all(...values);
		return { results: rows.map((r) => ({ ...r })) as T[] };
	}

	async run() {
		return this.runSync();
	}

	runSync() {
		const [sql, values] = this.compiled();
		const r = this.db.prepare(sql).run(...values);
		return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
	}
}

/** A fresh in-memory database with every migration in migrations/ applied. */
export function testDb(): D1Database {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON'); // D1 enforces foreign keys
	const dir = path.join(process.cwd(), 'migrations');
	for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
		db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
	}
	return {
		prepare: (sql: string) => new Statement(db, sql),
		// D1 runs a batch as one transaction: all or nothing.
		async batch(statements: Statement[]) {
			db.exec('BEGIN');
			try {
				const results = statements.map((s) => s.runSync());
				db.exec('COMMIT');
				return results;
			} catch (e) {
				db.exec('ROLLBACK');
				throw e;
			}
		},
		exec: async (sql: string) => db.exec(sql)
	} as unknown as D1Database;
}

/** A teaching group with students, for tests that need someone logged in. */
export async function seedStudents(db: D1Database, usernames: string[], cooldownHours = 0) {
	await db
		.prepare("INSERT INTO teaching_groups (id, name, spec, retry_cooldown_hours, created_at) VALUES (1, '10X', 'gcse-legacy', ?, '2026-09-01T00:00:00.000Z')")
		.bind(cooldownHours)
		.run();
	const ids: number[] = [];
	for (const username of usernames) {
		const r = await db
			.prepare("INSERT INTO students (group_id, username, login_code, created_at) VALUES (1, ?, ?, '2026-09-01T00:00:00.000Z')")
			.bind(username, generateCode())
			.run();
		ids.push(r.meta.last_row_id);
	}
	return ids;
}
