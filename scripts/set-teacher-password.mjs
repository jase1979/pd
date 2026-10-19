// Generates a new teacher password, saves it to a private file, and sets
// only its hash as the TEACHER_PASSWORD_HASH secret on Cloudflare. The
// password itself is never printed, sent anywhere or stored in this repo.
//
//   node scripts/set-teacher-password.mjs            production and preview
//   node scripts/set-teacher-password.mjs --local    .dev.vars only
//
// The password goes to ~/pd-teacher-password.txt (readable only by you).
// Copy it into your password manager, then delete that file. Running the
// script again replaces the password, and the old one stops working.

import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomInt } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const ITERATIONS = 100_000; // the most Cloudflare Workers' PBKDF2 allows

/** Five groups of five characters, e.g. K7MPQ-2XAB4-...: about 124 bits. */
export function generatePassword() {
	const groups = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''));
	return groups.join('-');
}

/**
 * The same format as hashPassword() in src/lib/server/teachers.ts.
 * @param {string} password
 * @param {number} [iterations]
 * @param {Buffer} [salt]
 */
export function hashPassword(password, iterations = ITERATIONS, salt = randomBytes(16)) {
	const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
	return `pbkdf2$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function main() {
	const local = process.argv.includes('--local');
	const password = generatePassword();
	const hash = hashPassword(password);

	if (local) {
		const file = path.join(process.cwd(), '.dev.vars');
		const lines = (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').split('\n').filter((l) => !l.startsWith('TEACHER_PASSWORD_HASH='));
		fs.writeFileSync(file, [...lines.filter((l, i) => l || i < lines.length - 1), `TEACHER_PASSWORD_HASH=${hash}`, ''].join('\n'));
	} else {
		for (const env of [[], ['--env', 'preview']]) {
			execFileSync('npx', ['wrangler', 'pages', 'secret', 'put', 'TEACHER_PASSWORD_HASH', '--project-name', 'pd', ...env], {
				input: hash,
				stdio: ['pipe', 'ignore', 'inherit']
			});
		}
	}

	const out = path.join(os.homedir(), local ? 'pd-teacher-password-local.txt' : 'pd-teacher-password.txt');
	fs.writeFileSync(out, `${password}\n`, { mode: 0o600 });
	fs.chmodSync(out, 0o600);
	console.log(`New teacher password saved to ${out} (only you can read it).`);
	console.log(local ? 'Its hash is in .dev.vars.' : 'Its hash is set on Cloudflare for production and preview.');
	console.log('Copy it into your password manager, then delete that file.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
