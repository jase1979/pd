// Creates a test group and students in the LOCAL development database, so
// logins and the teacher pages can be tried without real students.
//
//   npm run seed:dev               5 students, no history
//   npm run seed:dev -- --fake     24 students with three weeks of made-up history
//
// The group belongs to the first address in TEACHER_EMAILS (from .dev.vars),
// so it shows up when you sign in as that teacher. Running it again replaces
// the test group, its students and everything they did. It only ever touches
// the local database (.wrangler/), never the real one.
//
// The fake history is realistic enough to test the dashboards: confidence
// ratings and "I don't know", answers over several days, exam technique and
// timed attempts (some "not reached", some overtime), and a few deliberately
// broken questions so the question-health flags have something to find:
//   timber-001  too easy          timber-006  poor discrimination
//   timber-004  an option no one picks ("Oak")   timber-013  lots of "I don't know"

import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // same as src/lib/server/codes.ts
const GROUP = 'Test group (dev)';
const FAKE = process.argv.includes('--fake');
const SECONDS_PER_MARK = 45; // as in src/lib/server/config.ts

const code = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const sql = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const NOW = Date.now();
const DAY = 24 * 3600_000;

// A repeatable random number generator, so a re-seed gives similar data.
let seed = 20261019;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const normal = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const shuffle = (xs) => xs.map((x) => [rand(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

function teacherEmail() {
	const vars = fs.existsSync('.dev.vars') ? fs.readFileSync('.dev.vars', 'utf8') : '';
	const line = vars.split('\n').find((l) => l.startsWith('TEACHER_EMAILS='));
	return line?.slice('TEACHER_EMAILS='.length).split(',')[0].trim().toLowerCase() || 'teacher@example.com';
}

const email = teacherEmail();
const names = FAKE
	? Array.from({ length: 24 }, (_, i) => `test.student${String(i + 1).padStart(2, '0')}`)
	: Array.from({ length: 5 }, (_, i) => `test.student${i + 1}`);
const students = names.map((username, i) => ({ id: 900000 + i, username, code: code() }));
const created = new Date(NOW - 30 * DAY).toISOString();

const statements = [
	// Deleting the group cascades to its students, their attempts, answers and page views.
	`DELETE FROM sessions WHERE user_type = 'student' AND user_id IN (SELECT id FROM students WHERE group_id IN (SELECT id FROM teaching_groups WHERE name = ${sql(GROUP)}));`,
	`DELETE FROM teaching_groups WHERE name = ${sql(GROUP)};`,
	`INSERT INTO teachers (email, created_at) VALUES (${sql(email)}, ${sql(created)}) ON CONFLICT (email) DO NOTHING;`,
	`INSERT INTO teaching_groups (name, spec, owner_teacher_id, retry_cooldown_hours, created_at) SELECT ${sql(GROUP)}, 'gcse-legacy', id, 0, ${sql(created)} FROM teachers WHERE email = ${sql(email)};`,
	`INSERT INTO group_teachers (group_id, teacher_id) SELECT g.id, t.id FROM teaching_groups g, teachers t WHERE g.name = ${sql(GROUP)} AND t.email = ${sql(email)};`,
	...students.map(
		(s) =>
			`INSERT INTO students (id, group_id, username, login_code, created_at) SELECT ${s.id}, id, ${sql(s.username)}, ${sql(s.code)}, ${sql(created)} FROM teaching_groups WHERE name = ${sql(GROUP)};`
	)
];

if (FAKE) statements.push(...fakeHistory());

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-seed-'));
const file = path.join(dir, 'seed.sql');
fs.writeFileSync(file, statements.join('\n') + '\n');
try {
	execFileSync('npx', ['wrangler', 'd1', 'execute', 'pd', '--local', `--file=${file}`], { stdio: ['ignore', 'ignore', 'inherit'] });
} finally {
	fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nCreated "${GROUP}" (${students.length} students${FAKE ? ', with made-up history' : ''}) for ${email} in the local database.`);
console.log('Log in at http://localhost:5173/login/ with, for example:\n');
for (const s of students.slice(0, 5)) console.log(`  ${s.username.padEnd(18)} ${s.code.slice(0, 4)}-${s.code.slice(4)}`);
console.log('');

// ---- Made-up history -------------------------------------------------------------------

function fakeHistory() {
	const quizzes = fs
		.readdirSync('content/quizzes')
		.filter((f) => f.endsWith('.yml'))
		.map((f) => yaml.load(fs.readFileSync(path.join('content/quizzes', f), 'utf8')));
	const out = [];
	let attemptId = 950000;

	// How hard each question is (higher = harder), and the deliberately broken ones.
	const difficulty = new Map();
	for (const q of quizzes.flatMap((z) => z.questions)) difficulty.set(q.id, normal() * 0.8);
	difficulty.set('timber-001', -5); // too easy
	const IGNORES_ABILITY = 'timber-006'; // poor discrimination
	const MOSTLY_DONT_KNOW = 'timber-013'; // high "I don't know"
	const NEVER_CHOSEN = { 'timber-004': 2 }; // "Oak" is never picked

	const keyOf = (q) => (q.type === 'multi' ? q.answer : [q.answer]);
	const maxMarks = (q) => (q.type === 'multi' ? q.answer.length : q.type === 'two_tier' ? 2 : 1);
	const wrongOption = (q, count = q.options.length, right = keyOf(q)) => {
		const banned = NEVER_CHOSEN[q.id];
		return pick([...Array(count).keys()].filter((i) => !right.includes(i) && i !== banned));
	};

	/** One answer by a student of ability `theta`, on their `round`th go. */
	function answer(student, q, round, { overconfident }) {
		const p = q.id === IGNORES_ABILITY ? 0.5 : 1 / (1 + Math.exp(-(student.theta - difficulty.get(q.id) + 0.35 * round)));
		const dontKnow = rand() < (q.id === MOSTLY_DONT_KNOW ? 0.5 : 0.1 * (1 - p));
		if (dontKnow) return { chosen: null, dont_know: 1, confidence: null, marks: 0, max: maxMarks(q) };
		const right = rand() < p;
		let chosen;
		let marks;
		if (q.type === 'multi') {
			chosen = right ? [...q.answer] : rand() < 0.6 ? [q.answer[0], wrongOption(q)] : [wrongOption(q), wrongOption(q)];
			chosen = [...new Set(chosen)];
			while (chosen.length < q.answer.length) chosen.push(wrongOption(q));
			chosen.sort((a, b) => a - b);
			marks = chosen.filter((i) => q.answer.includes(i)).length;
		} else if (q.type === 'two_tier') {
			const half = !right && rand() < 0.5;
			const a = right || half ? q.answer : wrongOption(q);
			const r = right ? q.reason.answer : wrongOption(q, q.reason.options.length, [q.reason.answer]);
			chosen = { answer: a, reason: r };
			marks = a === q.answer ? (r === q.reason.answer ? 2 : 1) : 0;
		} else {
			chosen = right ? q.answer : wrongOption(q);
			marks = right ? 1 : 0;
		}
		const sure = overconfident ? rand() < 0.9 : rand() < (marks === maxMarks(q) ? 0.35 + 0.5 * p : 0.3);
		return { chosen, dont_know: 0, confidence: sure ? 'sure' : 'guess', marks, max: maxMarks(q) };
	}

	function saveAttempt(student, mode, quizId, questions, startedAt, answers, timing = {}) {
		const id = attemptId++;
		const score = answers.reduce((s, a) => s + a.marks, 0);
		const max = answers.reduce((s, a) => s + a.max, 0);
		const taken = timing.taken ?? Math.round(60 + questions.length * (25 + rand() * 30));
		out.push(
			`INSERT INTO attempts (id, student_id, mode, quiz_id, question_ids, score, max_score, time_limit_s, time_taken_s, overtime, started_at, completed_at) VALUES (${id}, ${student.id}, ${sql(mode)}, ${sql(quizId)}, ${sql(JSON.stringify(questions.map((q) => q.id)))}, ${score}, ${max}, ${sql(timing.limit ?? null)}, ${taken}, ${timing.overtime ? 1 : 0}, ${sql(new Date(startedAt).toISOString())}, ${sql(new Date(startedAt + taken * 1000).toISOString())});`
		);
		questions.forEach((q, i) => {
			const a = answers[i];
			out.push(
				`INSERT INTO attempt_answers (attempt_id, question_id, quiz_id, spec_point, concept, command, qtype, skill_format, chosen, dont_know, not_reached, confidence, marks, max_marks, correct) VALUES (${id}, ${sql(q.id)}, ${sql(q.quiz_id)}, ${sql(q.spec_point)}, ${sql(q.concept)}, ${sql(q.command)}, ${sql(q.type ?? 'single')}, ${sql(q.type === 'exam_skill' ? q.format : null)}, ${sql(a.chosen === null ? null : JSON.stringify(a.chosen))}, ${a.dont_know}, ${a.not_reached ? 1 : 0}, ${sql(a.confidence)}, ${a.marks}, ${a.max}, ${a.marks === a.max && !a.not_reached ? 1 : 0});`
			);
		});
	}

	/** One question per concept, knowledge first, exam technique last. */
	function draw(quiz, knowledge, skills) {
		const qs = quiz.questions.map((q) => ({ ...q, type: q.type ?? 'single', quiz_id: quiz.id }));
		const byConcept = (list, n) => {
			const seen = new Set();
			return shuffle(list).filter((q) => !seen.has(q.concept) && seen.add(q.concept)).slice(0, n);
		};
		return [...byConcept(qs.filter((q) => q.type !== 'exam_skill'), knowledge), ...byConcept(qs.filter((q) => q.type === 'exam_skill'), skills)];
	}

	students.forEach((s, i) => {
		const student = { ...s, theta: normal() };
		const overconfident = i % 8 === 3; // three students who are sure of everything
		const quiz = quizzes[0];
		const firstDay = NOW - (21 - Math.floor(rand() * 5)) * DAY;

		// Notes: most students read them, some before their first quiz, some after.
		if (rand() < 0.8) {
			const viewed = firstDay + (rand() < 0.5 ? -DAY : 2 * DAY);
			out.push(`INSERT INTO page_activity (student_id, page_path, first_viewed, last_viewed, view_count) VALUES (${s.id}, ${sql(quiz.page)}, ${sql(new Date(viewed).toISOString())}, ${sql(new Date(viewed + 5 * DAY).toISOString())}, ${2 + Math.floor(rand() * 6)});`);
		}

		// Two to four topic quizzes, a few days apart (three students stopped early: inactive).
		const rounds = i % 8 === 7 ? 1 : 2 + Math.floor(rand() * 3);
		for (let r = 0; r < rounds; r++) {
			const when = firstDay + r * (2 + rand() * 3) * DAY + 15 * 3600_000;
			const qs = draw(quiz, 10, 2);
			saveAttempt(student, 'topic', quiz.id, qs, when, qs.map((q) => answer(student, q, r, { overconfident })));
		}
		if (rounds === 1) return;

		// A mistakes round, a mixed review and, for most, timed practice.
		const later = firstDay + 12 * DAY + 16 * 3600_000;
		const mixed = draw(quiz, 10, 2);
		saveAttempt(student, 'mixed', null, mixed, later, mixed.map((q) => answer(student, q, rounds, { overconfident })));
		if (rand() < 0.7) {
			const qs = draw(quiz, 16, 3);
			const limit = qs.reduce((t, q) => t + maxMarks(q), 0) * SECONDS_PER_MARK;
			const overtime = i % 11 === 5;
			const taken = overtime ? limit + 120 : Math.round(limit * (0.6 + rand() * 0.42));
			const reach = taken >= limit ? Math.floor(qs.length * (0.7 + rand() * 0.25)) : qs.length;
			const answers = qs.map((q, k) =>
				k < reach ? answer(student, q, rounds, { overconfident }) : { chosen: null, dont_know: 0, not_reached: true, confidence: null, marks: 0, max: maxMarks(q) }
			);
			saveAttempt(student, 'timed', null, qs, later + 2 * DAY, answers, { limit, taken: Math.min(taken, limit + (overtime ? 120 : 10)), overtime });
		}
		const tech = draw(quiz, 0, 3);
		if (tech.length) saveAttempt(student, 'technique', null, tech, later + 3 * DAY, tech.map((q) => answer(student, q, rounds, { overconfident })));
	});

	// Last active: their latest attempt.
	out.push(`UPDATE students SET last_active_at = (SELECT MAX(completed_at) FROM attempts WHERE student_id = students.id) WHERE id BETWEEN 900000 AND 900999;`);
	return out;
}
