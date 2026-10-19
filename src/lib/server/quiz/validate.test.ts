import { describe, expect, it } from 'vitest';
import { validateQuizzes, type QuizFile } from './validate';

const opts = {
	imageExists: (url: string) => url === '/assets/quiz-images/timber/bench.jpg',
	pageExists: (url: string) => url === '/gcse/unit2/timber/' || url === '/gcse/unit2/stock-forms/'
};

function goodQuestion(id = 'timber-001'): Record<string, unknown> {
	return {
		id,
		status: 'draft',
		spec_point: '2.1.2.2',
		concept: 'hardwood-vs-softwood',
		command: 'identify',
		see: '#hardwoods',
		text: 'Which of these is a hardwood?',
		options: [{ text: 'Pine', why_wrong: 'Conifer.' }, { text: 'Balsa' }],
		answer: 1,
		explanation: 'Balsa is from a broadleaf tree.'
	};
}

function goodQuiz(questions = [goodQuestion()]): Record<string, unknown> {
	return {
		id: 'legacy-u2-timber',
		spec: 'gcse-legacy',
		unit: '2.1.2',
		topic: 'Timber',
		page: '/gcse/unit2/timber/',
		questions_per_attempt: 10,
		questions
	};
}

const file = (data: unknown, path = 'content/quizzes/legacy-u2-timber.yml'): QuizFile => ({ path, data });

/** Errors for one quiz file whose question has been changed by `edit`. */
function errorsFor(edit: (q: Record<string, unknown>) => void): string[] {
	const q = goodQuestion();
	edit(q);
	return validateQuizzes([file(goodQuiz([q]))], opts).errors;
}

describe('validateQuizzes', () => {
	it('accepts a valid quiz and fills in the defaults', () => {
		const { quizzes, errors } = validateQuizzes([file(goodQuiz())], opts);
		expect(errors).toEqual([]);
		expect(quizzes[0].questions[0].type).toBe('single');
		// A bare anchor is turned into a full path on the quiz's page.
		expect(quizzes[0].questions[0].see).toBe('/gcse/unit2/timber/#hardwoods');
	});

	it('keeps a full-path see as it is', () => {
		const { quizzes } = validateQuizzes([file(goodQuiz([{ ...goodQuestion(), see: '/gcse/unit2/stock-forms/#sizes' }]))], opts);
		expect(quizzes[0].questions[0].see).toBe('/gcse/unit2/stock-forms/#sizes');
	});

	it('names the file and question in each error', () => {
		const [error] = errorsFor((q) => delete q.explanation);
		expect(error).toBe('content/quizzes/legacy-u2-timber.yml: question timber-001: missing required field "explanation"');
	});

	it.each([
		['a missing required field', (q: Record<string, unknown>) => delete q.concept, /missing required field "concept"/],
		['an unknown field (e.g. a typo)', (q: Record<string, unknown>) => (q.explaination = 'x'), /unknown field "explaination"/],
		['an unknown type', (q: Record<string, unknown>) => (q.type = 'essay'), /unknown type "essay"/],
		['an unknown status', (q: Record<string, unknown>) => (q.status = 'done'), /status "done"/],
		['an unknown command', (q: Record<string, unknown>) => (q.command = 'list'), /command "list"/],
		['a command not allowed for single', (q: Record<string, unknown>) => (q.command = 'evaluate'), /command "evaluate" isn't allowed for a single question/],
		['an answer out of range', (q: Record<string, unknown>) => (q.answer = 2), /answer 2 should be the number of an option, from 0 to 1/],
		['a negative answer', (q: Record<string, unknown>) => (q.answer = -1), /answer -1/],
		['a list answer on a single question', (q: Record<string, unknown>) => (q.answer = [0, 1]), /single number.*type: multi/],
		['working on a non-calculate question', (q: Record<string, unknown>) => (q.working = 'Step 1'), /"working" is only for questions with command: calculate/],
		['an undefined scenario', (q: Record<string, unknown>) => (q.scenario = 'nowhere'), /scenario "nowhere" isn't defined/],
		['a field from another type', (q: Record<string, unknown>) => (q.reason = {}), /"reason" is only for two_tier questions/],
		['marks_awarded outside best_answer', (q: Record<string, unknown>) => ((q.options as Record<string, unknown>[])[0].marks_awarded = 1), /marks_awarded is only for exam_skill best_answer/],
		['fewer than two options', (q: Record<string, unknown>) => (q.options = [{ text: 'Only' }]), /at least two options/],
		['an option with no text or image', (q: Record<string, unknown>) => ((q.options as unknown[])[0] = { why_wrong: 'x' }), /needs text, an image, or both/],
		['an option written as plain text', (q: Record<string, unknown>) => ((q.options as unknown[])[0] = 'Pine'), /put the option text after "text:"/],
		['an incorrect option without why_wrong', (q: Record<string, unknown>) => ((q.options as Record<string, unknown>[])[0] = { text: 'Pine' }), /is incorrect, so it needs a why_wrong/],
		['why_wrong on the correct option', (q: Record<string, unknown>) => ((q.options as Record<string, unknown>[])[1].why_wrong = 'x'), /is a correct answer, so it shouldn't have a why_wrong/],
		['an image without image_alt', (q: Record<string, unknown>) => (q.image = '/assets/quiz-images/timber/bench.jpg'), /no image_alt/],
		['an image file that does not exist', (q: Record<string, unknown>) => Object.assign(q, { image: '/assets/quiz-images/timber/missing.jpg', image_alt: 'A bench' }), /doesn't exist/],
		['an image outside quiz-images', (q: Record<string, unknown>) => Object.assign(q, { image: '/assets/img/x.jpg', image_alt: 'x' }), /should be under \/assets\/quiz-images/],
		['an option image without image_alt', (q: Record<string, unknown>) => ((q.options as Record<string, unknown>[])[1].image = '/assets/quiz-images/timber/bench.jpg'), /option 1 .*no image_alt/],
		['a malformed see', (q: Record<string, unknown>) => (q.see = 'hardwoods'), /see "hardwoods"/],
		['a bad question id', (q: Record<string, unknown>) => (q.id = 'Timber 1'), /id "Timber 1"/],
		['empty text', (q: Record<string, unknown>) => (q.text = '  '), /"text" should be text/]
	])('rejects %s', (_name, edit, pattern) => {
		const errors = errorsFor(edit);
		expect(errors.some((e) => pattern.test(e)), `got: ${errors.join('\n')}`).toBe(true);
	});

	it('accepts a valid image with alt text', () => {
		expect(errorsFor((q) => Object.assign(q, { image: '/assets/quiz-images/timber/bench.jpg', image_alt: 'A bench' }))).toEqual([]);
	});

	it('rejects duplicate question ids, even across quizzes', () => {
		const a = file(goodQuiz([goodQuestion('timber-001'), goodQuestion('timber-001')]));
		expect(validateQuizzes([a], opts).errors).toEqual([expect.stringMatching(/timber-001: duplicate question id/)]);

		const b = file({ ...goodQuiz([goodQuestion('timber-001')]), id: 'legacy-u2-stock', page: '/gcse/unit2/stock-forms/' }, 'content/quizzes/legacy-u2-stock.yml');
		const errors = validateQuizzes([file(goodQuiz()), b], opts).errors;
		expect(errors).toEqual([expect.stringMatching(/legacy-u2-stock.yml: question timber-001: duplicate question id \(also used in content\/quizzes\/legacy-u2-timber.yml\)/)]);
	});

	it('rejects duplicate quiz ids', () => {
		const errors = validateQuizzes([file(goodQuiz()), file({ ...goodQuiz([goodQuestion('timber-002')]), page: '/gcse/unit2/stock-forms/' })], opts).errors;
		expect(errors).toEqual([expect.stringMatching(/duplicate quiz id "legacy-u2-timber"/)]);
	});

	it('rejects a quiz id that does not match its file name', () => {
		expect(validateQuizzes([file(goodQuiz(), 'content/quizzes/timber.yml')], opts).errors).toEqual([
			expect.stringMatching(/rename the file to legacy-u2-timber.yml/)
		]);
	});

	it.each([
		['a missing field', { topic: undefined }, /missing required field "topic"/],
		['an unknown spec', { spec: 'gcse' }, /spec "gcse"/],
		['a page that is not a topic page', { page: '/gcse/unit2/nope/' }, /page "\/gcse\/unit2\/nope\/" isn't a topic page/],
		['a bad questions_per_attempt', { questions_per_attempt: 0 }, /questions_per_attempt/],
		['a bad exam_skills_per_attempt', { exam_skills_per_attempt: -1 }, /exam_skills_per_attempt/],
		['a past paper link without a title', { past_papers: [{ url: '/past-papers/#s24-q6' }] }, /past_papers 1: missing "title"/],
		['a past paper link off the site', { past_papers: [{ title: 'x', url: 'https://example.com' }] }, /should be a path on this site/],
		['a scenario without text', { scenarios: [{ id: 'bench' }] }, /scenario bench: missing "text"/],
		['duplicate scenario ids', { scenarios: [{ id: 'bench', text: 'a' }, { id: 'bench', text: 'b' }] }, /duplicate scenario id/],
		['a scenario image without alt text', { scenarios: [{ id: 'bench', text: 'a', image: '/assets/quiz-images/timber/bench.jpg' }] }, /scenario bench: has an image but no image_alt/],
		['no questions', { questions: [] }, /at least one question/],
		['an unknown quiz field', { title: 'x' }, /unknown field "title"/]
	])('rejects a quiz with %s', (_name, change, pattern) => {
		const errors = validateQuizzes([file({ ...goodQuiz(), ...change })], opts).errors;
		expect(errors.some((e) => pattern.test(e)), `got: ${errors.join('\n')}`).toBe(true);
	});

	it('rejects two quizzes on the same page', () => {
		const other = file({ ...goodQuiz([goodQuestion('timber-002')]), id: 'legacy-u2-other' }, 'content/quizzes/legacy-u2-other.yml');
		expect(validateQuizzes([file(goodQuiz()), other], opts).errors).toEqual([expect.stringMatching(/already has a quiz/)]);
	});

	it('rejects a file that is not a quiz at all', () => {
		expect(validateQuizzes([file(['a', 'list'])], opts).errors).toEqual([expect.stringMatching(/should be a quiz/)]);
	});

	it('leaves a quiz with errors out of the bank', () => {
		expect(validateQuizzes([file({ ...goodQuiz(), spec: 'nope' })], opts).quizzes).toEqual([]);
	});

	it('fills in exam_skills_per_attempt, past_papers and scenarios when they are left out', () => {
		const [q] = validateQuizzes([file(goodQuiz())], opts).quizzes;
		expect(q).toMatchObject({ exam_skills_per_attempt: 2, past_papers: [], scenarios: [] });
	});
});

/** Errors for a quiz containing just this question. */
function errorsForQuestion(q: Record<string, unknown>, quizExtra: Record<string, unknown> = {}): string[] {
	return validateQuizzes([file({ ...goodQuiz([q]), ...quizExtra })], opts).errors;
}

describe('validateQuizzes: multi', () => {
	const multi = (extra: Record<string, unknown> = {}) => ({
		...goodQuestion(),
		type: 'multi',
		options: [{ text: 'MDF' }, { text: 'Plywood' }, { text: 'Beech', why_wrong: 'Natural.' }],
		answer: [0, 1],
		...extra
	});

	it('accepts a valid "Select TWO"', () => {
		expect(errorsForQuestion(multi())).toEqual([]);
	});

	it.each([
		['a single number as the answer', { answer: 0 }, /list of option numbers for a multi question/],
		['an option number out of range', { answer: [0, 5] }, /answer \[5\] should only use option numbers from 0 to 2/],
		['the same option twice', { answer: [0, 0] }, /same option twice/],
		['only one correct option', { answer: [0] }, /at least 2 correct options/],
		['every option correct', { answer: [0, 1, 2], options: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] }, /at least one wrong one/],
		['why_wrong on a correct option', { options: [{ text: 'MDF', why_wrong: 'x' }, { text: 'Plywood' }, { text: 'Beech', why_wrong: 'Natural.' }] }, /option 0 .*correct answer/],
		['a command it may not use', { command: 'explain' }, /command "explain" isn't allowed for a multi question/]
	])('rejects %s', (_name, change, pattern) => {
		const errors = errorsForQuestion(multi(change));
		expect(errors.some((e) => pattern.test(e)), `got: ${errors.join('\n')}`).toBe(true);
	});
});

describe('validateQuizzes: two_tier', () => {
	const twoTier = (extra: Record<string, unknown> = {}, reason: Record<string, unknown> = {}) => ({
		...goodQuestion(),
		type: 'two_tier',
		command: 'explain',
		reason: {
			text: 'Why?',
			options: [{ text: 'Natural oils' }, { text: 'Cheap', why_wrong: 'It is expensive.' }],
			answer: 0,
			...reason
		},
		...extra
	});

	it('accepts a valid two-tier question, and explain/compare commands', () => {
		expect(errorsForQuestion(twoTier())).toEqual([]);
		expect(errorsForQuestion(twoTier({ command: 'compare' }))).toEqual([]);
	});

	it.each([
		['no reason', { reason: undefined }, {}, /missing required field "reason"/],
		['a reason without text', {}, { text: undefined }, /reason: missing "text"/],
		['a reason answer out of range', {}, { answer: 2 }, /reason: answer 2/],
		['an incorrect reason without why_wrong', {}, { options: [{ text: 'a' }, { text: 'b' }] }, /reason option 1 .*needs a why_wrong/],
		['why_wrong on the correct reason', {}, { options: [{ text: 'a', why_wrong: 'x' }, { text: 'b', why_wrong: 'y' }] }, /reason option 0 .*correct answer/],
		['an evaluate command', { command: 'evaluate' }, {}, /command "evaluate" isn't allowed for a two_tier question/]
	])('rejects %s', (_name, change, reason, pattern) => {
		const q = twoTier(change, reason);
		if ('reason' in change && change.reason === undefined) delete (q as Record<string, unknown>).reason;
		const errors = errorsForQuestion(q);
		expect(errors.some((e) => pattern.test(e)), `got: ${errors.join('\n')}`).toBe(true);
	});
});

describe('validateQuizzes: exam_skill', () => {
	const bestAnswer = (extra: Record<string, unknown> = {}) => ({
		...goodQuestion(),
		type: 'exam_skill',
		format: 'best_answer',
		command: 'evaluate',
		exam_question: { text: 'Explain why iroko suits a bench.', marks: 2 },
		text: 'Which answer would get full marks?',
		options: [
			{ text: 'It is a hardwood.', marks_awarded: 0, why_wrong: 'No property.' },
			{ text: 'It has natural oils.', marks_awarded: 1, why_wrong: 'Not linked.' },
			{ text: 'It has natural oils, so it resists rot outdoors.', marks_awarded: 2 }
		],
		answer: 2,
		...extra
	});

	it('accepts a valid best_answer question, with any command word', () => {
		expect(errorsForQuestion(bestAnswer())).toEqual([]);
	});

	it('accepts a valid missing_point question', () => {
		const q = {
			...bestAnswer({ format: 'missing_point', sample_answer: 'It has natural oils.' }),
			options: [{ text: 'So it resists rot' }, { text: 'It is brown', why_wrong: 'Not relevant.' }],
			answer: 0
		};
		expect(errorsForQuestion(q)).toEqual([]);
	});

	const sample = (marks: number[]) =>
		marks.map((m, i) => ({ text: `Answer ${i}`, marks_awarded: m, ...(i !== 2 && { why_wrong: 'Fewer marks.' }) }));

	it.each([
		['no format', { format: undefined }, /missing required field "format"/],
		['an unknown format', { format: 'essay' }, /format "essay"/],
		['no exam_question', { exam_question: undefined }, /missing required field "exam_question"/],
		['exam_question without marks', { exam_question: { text: 'Explain.' } }, /exam_question: "marks"/],
		['an option without marks_awarded', { options: [{ text: 'a', why_wrong: 'x' }, ...sample([1, 1, 2]).slice(1)] }, /option 0 .*needs marks_awarded/],
		['the correct option not scoring highest', { options: sample([0, 2, 1]) }, /must score more than every other sample answer/],
		['a tie for the highest mark', { options: sample([2, 0, 2]) }, /must score more than every other sample answer/],
		['marks_awarded above the exam question marks', { options: sample([0, 1, 3]) }, /marks_awarded should be a whole number from 0 to 2/],
		['missing_point without a sample_answer', { format: 'missing_point', options: [{ text: 'a' }, { text: 'b', why_wrong: 'x' }], answer: 0 }, /needs a sample_answer/],
		['a sample_answer on best_answer', { sample_answer: 'x' }, /sample_answer is only for missing_point/]
	])('rejects %s', (_name, change, pattern) => {
		const q: Record<string, unknown> = bestAnswer(change);
		for (const [k, v] of Object.entries(change)) if (v === undefined) delete q[k];
		const errors = errorsForQuestion(q);
		expect(errors.some((e) => pattern.test(e)), `got: ${errors.join('\n')}`).toBe(true);
	});

	it('checks a scenario reference', () => {
		expect(errorsForQuestion(bestAnswer({ scenario: 'bench' }), { scenarios: [{ id: 'bench', text: 'A bench.' }] })).toEqual([]);
	});
});
