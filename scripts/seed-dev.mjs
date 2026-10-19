// Creates a test group and students in the LOCAL development database, so
// student logins can be tried before the teacher pages exist (Phase 3).
//
//   npm run seed:dev
//
// Running it again replaces the test group, its students and their answers.
// It only ever touches the local database (.wrangler/), never the real one.

import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // same as src/lib/server/codes.ts
const GROUP = 'Test group (dev)';
const STUDENTS = ['test.student1', 'test.student2', 'test.student3', 'test.student4', 'test.student5'];

const code = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;
const now = new Date().toISOString();

const students = STUDENTS.map((username) => ({ username, code: code() }));
const statements = [
	// Deleting the group cascades to its students, their attempts, answers and page views.
	`DELETE FROM teaching_groups WHERE name = ${sql(GROUP)};`,
	`INSERT INTO teaching_groups (name, spec, retry_cooldown_hours, created_at) VALUES (${sql(GROUP)}, 'gcse-legacy', 0, ${sql(now)});`,
	...students.map(
		(s) =>
			`INSERT INTO students (group_id, username, login_code, created_at) SELECT id, ${sql(s.username)}, ${sql(s.code)}, ${sql(now)} FROM teaching_groups WHERE name = ${sql(GROUP)};`
	)
];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-seed-'));
const file = path.join(dir, 'seed.sql');
fs.writeFileSync(file, statements.join('\n') + '\n');
try {
	execFileSync('npx', ['wrangler', 'd1', 'execute', 'pd', '--local', `--file=${file}`], { stdio: ['ignore', 'ignore', 'inherit'] });
} finally {
	fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nCreated "${GROUP}" in the local database. Log in at http://localhost:5173/login/ with:\n`);
for (const s of students) console.log(`  ${s.username.padEnd(16)} ${s.code.slice(0, 4)}-${s.code.slice(4)}`);
console.log('');
