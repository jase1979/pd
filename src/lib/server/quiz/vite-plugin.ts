// Builds the quiz bank from content/quizzes/*.yml at build time, as the
// virtual module "virtual:quiz-bank". This does the job the spec gives to
// scripts/build-quizzes.mjs and quiz-bank.json:
//
// - Every quiz file is validated; any error fails `npm run build` (and shows
//   on screen in `npm run dev`) with a list of what's wrong.
// - The bank, answers included, is compiled into the server code. It is never
//   written to a file that could be published.
// - Only files under src/lib/server/ may import it. SvelteKit already refuses
//   to send anything under $lib/server to the browser, so the answers can't
//   end up in a browser bundle by accident.
//
// Loaded by vite.config.ts, so it runs in Node and can use the file system.

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { Plugin } from 'vite';
import { validateQuizzes, type QuizFile } from './validate';
import type { QuizBank } from './types';

const VIRTUAL_ID = 'virtual:quiz-bank';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

/** Read and validate every quiz under `root`. Exported for the tests. */
export function loadQuizBank(root: string): { bank: QuizBank; errors: string[]; files: string[] } {
	const dir = path.join(root, 'content', 'quizzes');
	const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort() : [];
	const files: string[] = [];
	const parsed: QuizFile[] = [];
	const errors: string[] = [];

	for (const name of names) {
		const file = path.join(dir, name);
		const shown = `content/quizzes/${name}`;
		files.push(file);
		try {
			parsed.push({ path: shown, data: yaml.load(fs.readFileSync(file, 'utf8')) });
		} catch (e) {
			// js-yaml's message already includes the line and column.
			errors.push(`${shown}: the YAML can't be read. ${(e as Error).message}`);
		}
	}

	const result = validateQuizzes(parsed, {
		imageExists: (url) => fs.existsSync(path.join(root, 'static', url)),
		// /gcse/unit2/timber/ is built from content/gcse/unit2/timber/index.md
		pageExists: (url) => /^\/.*\/$/.test(url) && fs.existsSync(path.join(root, 'content', url, 'index.md'))
	});
	return { bank: { quizzes: result.quizzes }, errors: [...errors, ...result.errors], files };
}

export function quizBank(): Plugin {
	let root = process.cwd();

	return {
		name: 'quiz-bank',
		configResolved(config) {
			root = config.root;
		},
		resolveId(id, importer) {
			if (id !== VIRTUAL_ID) return;
			const from = importer ? path.relative(root, importer).split(path.sep).join('/') : '';
			if (!from.startsWith('src/lib/server/')) {
				this.error(`${VIRTUAL_ID} holds the quiz answers, so only files in src/lib/server/ may import it (imported from ${from || 'unknown'})`);
			}
			return RESOLVED_ID;
		},
		load(id) {
			if (id !== RESOLVED_ID) return;
			const { bank, errors, files } = loadQuizBank(root);
			for (const file of files) this.addWatchFile(file);
			if (errors.length > 0) {
				this.error(`\n\nThe quiz files have ${errors.length} problem(s):\n\n  - ${errors.join('\n  - ')}\n`);
			}
			return `export default ${JSON.stringify(bank)};`;
		},
		// In `npm run dev`, rebuild the bank when a quiz file is added, edited or deleted.
		configureServer(server) {
			const dir = path.join(root, 'content', 'quizzes');
			server.watcher.add(dir);
			const reload = (file: string) => {
				if (!file.startsWith(dir)) return;
				const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
				if (mod) server.moduleGraph.invalidateModule(mod);
				server.ws.send({ type: 'full-reload' });
			};
			server.watcher.on('add', reload);
			server.watcher.on('change', reload);
			server.watcher.on('unlink', reload);
		}
	};
}
