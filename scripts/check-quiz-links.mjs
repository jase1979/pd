// Runs after `vite build` (see "build" in package.json). Checks that every
// quiz "see" link and past_papers link points at a page and #anchor that
// exist in the built site. Missing ones are listed as warnings; they don't
// fail the build.
//
// A bare "#anchor" in `see` is on the quiz's own page, as in the quiz bank.

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const root = process.cwd();
const quizDir = path.join(root, 'content', 'quizzes');
const siteDir = path.join(root, '.svelte-kit', 'cloudflare');

/** "/gcse/unit2/timber/#hardwoods" -> what's wrong with it, or null if it's fine. */
function problem(url, htmlCache) {
	const [pathname, anchor] = url.split('#');
	const file = path.join(siteDir, pathname, 'index.html');
	if (!htmlCache.has(file)) htmlCache.set(file, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
	const html = htmlCache.get(file);
	if (html === null) return `there is no page at ${pathname}`;
	if (anchor && !html.includes(`id="${anchor}"`)) return `${pathname} has no #${anchor}`;
	return null;
}

const warnings = [];
const htmlCache = new Map();
const files = fs.existsSync(quizDir) ? fs.readdirSync(quizDir).filter((f) => /\.ya?ml$/.test(f)).sort() : [];

for (const name of files) {
	const quiz = yaml.load(fs.readFileSync(path.join(quizDir, name), 'utf8'));
	const links = [
		...(quiz.questions ?? [])
			.filter((q) => typeof q.see === 'string')
			.map((q) => ({ where: `question ${q.id} see`, url: q.see.startsWith('#') ? quiz.page + q.see : q.see })),
		...(quiz.past_papers ?? []).map((p, i) => ({ where: `past_papers ${i + 1}`, url: p.url }))
	];
	for (const { where, url } of links) {
		const why = problem(url, htmlCache);
		if (why) warnings.push(`content/quizzes/${name}: ${where} "${url}": ${why}`);
	}
}

if (warnings.length) {
	console.warn(`\n⚠ ${warnings.length} quiz link(s) point at something that doesn't exist:\n  - ${warnings.join('\n  - ')}\n`);
} else {
	console.log(`✓ quiz links checked (${files.length} quiz file(s))`);
}
