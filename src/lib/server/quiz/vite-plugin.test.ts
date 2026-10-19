import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadQuizBank } from './vite-plugin';

describe('loadQuizBank', () => {
	it('loads the real quiz files without errors', () => {
		const { bank, errors } = loadQuizBank(process.cwd());
		expect(errors).toEqual([]);
		expect(bank.quizzes.map((q) => q.id)).toContain('legacy-u2-timber');
	});

	it('reports YAML that cannot be parsed, with where the problem is', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-'));
		fs.mkdirSync(path.join(root, 'content', 'quizzes'), { recursive: true });
		fs.writeFileSync(path.join(root, 'content', 'quizzes', 'broken.yml'), 'id: broken\nquestions:\n  - id: [unclosed\n');
		const { errors } = loadQuizBank(root);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatch(/^content\/quizzes\/broken.yml: the YAML can't be read\..*\(\d+:\d+\)/s);
		fs.rmSync(root, { recursive: true });
	});
});
