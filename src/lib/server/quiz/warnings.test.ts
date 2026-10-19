import { describe, expect, it } from 'vitest';
import { quizWarnings } from './warnings';
import { quizReport } from './report';
import { bestAnswer, question, quiz } from './fixtures';

const file = 'content/quizzes/test-quiz.yml';

/** A quiz that meets every target, so it has no warnings. */
function healthy() {
	const q = quiz(17, { scenarios: [{ id: 'bench', text: 'A bench.' }] });
	q.questions.forEach((x, i) => i % 2 === 0 && (x.scenario = 'bench'));
	q.questions.push(bestAnswer('b-1', 'b-1'), bestAnswer('b-2', 'b-2', { context: true }), bestAnswer('b-3', 'b-3', { scenario: 'bench' }));
	return q;
}

describe('quizWarnings', () => {
	it('has nothing to say about a quiz that meets the targets', () => {
		expect(quizWarnings(healthy(), file)).toEqual([]);
	});

	it('warns about fewer than 20 reviewed questions', () => {
		const q = healthy();
		q.questions[0].status = 'draft';
		expect(quizWarnings(q, file)).toEqual([expect.stringMatching(/only 19 reviewed questions/)]);
	});

	it('warns about fewer reviewed concepts than questions_per_attempt', () => {
		const q = healthy();
		q.questions_per_attempt = 18;
		expect(quizWarnings(q, file)).toEqual([expect.stringMatching(/only 17 reviewed concepts, fewer than questions_per_attempt \(18\)/)]);
	});

	it('warns about fewer than 3 reviewed exam_skill questions', () => {
		const q = healthy();
		q.questions.at(-1)!.status = 'draft';
		expect(quizWarnings(q, file)).toContainEqual(expect.stringMatching(/only 2 reviewed exam_skill questions/));
	});

	it('warns when fewer than half the questions are in a product context', () => {
		const q = healthy();
		q.questions.forEach((x) => {
			delete x.scenario;
			delete x.context;
		});
		expect(quizWarnings(q, file)).toEqual([expect.stringMatching(/only 0% of questions are set in a product context/)]);
	});

	it('warns about a question with no see link', () => {
		const q = healthy();
		delete q.questions[3].see;
		expect(quizWarnings(q, file)).toEqual([`${file}: question q-4: no "see" link, so its feedback has no "Revise this" link`]);
	});

	it('warns about long explanations and why_wrong', () => {
		const q = healthy();
		q.questions[0] = question('q-1', 'concept-1', { scenario: 'bench', explanation: 'x'.repeat(301) });
		q.questions[1].options[1].why_wrong = 'y'.repeat(350);
		const warnings = quizWarnings(q, file);
		expect(warnings).toContainEqual(expect.stringMatching(/q-1: explanation is 301 characters/));
		expect(warnings).toContainEqual(expect.stringMatching(/q-2: option 1 why_wrong is 350 characters/));
	});
});

describe('quizReport', () => {
	it('summarises each quiz and lists the warnings', () => {
		const q = healthy();
		q.questions.push(question('c-1', 'c-1', { command: 'calculate', status: 'draft' }));
		const report = quizReport([q], ['a warning']);
		expect(report).toContain('## Test topic (`test-quiz`)');
		expect(report).toContain('| Questions | 21 (draft 1, reviewed 20) |');
		expect(report).toContain('| By type | exam_skill 3, single 18 |');
		expect(report).toContain('| exam_skill formats | best_answer 3 |');
		expect(report).toContain('| Calculation questions | 1 |');
		expect(report).toContain('| Reviewed concepts | 17 (an attempt draws up to 10) |');
		expect(report).toContain('- a warning');
	});
});
