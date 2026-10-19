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
		['a type not supported yet', (q: Record<string, unknown>) => (q.type = 'multi'), /unknown type "multi"/],
		['an unknown status', (q: Record<string, unknown>) => (q.status = 'done'), /status "done"/],
		['an unknown command', (q: Record<string, unknown>) => (q.command = 'list'), /command "list"/],
		['a command not allowed for single', (q: Record<string, unknown>) => (q.command = 'evaluate'), /command "evaluate" isn't allowed for a single question/],
		['an answer out of range', (q: Record<string, unknown>) => (q.answer = 2), /answer 2 should be the number of an option, from 0 to 1/],
		['a negative answer', (q: Record<string, unknown>) => (q.answer = -1), /answer -1/],
		['a list answer on a single question', (q: Record<string, unknown>) => (q.answer = [0, 1]), /single number/],
		['fewer than two options', (q: Record<string, unknown>) => (q.options = [{ text: 'Only' }]), /at least two options/],
		['an option with no text or image', (q: Record<string, unknown>) => ((q.options as unknown[])[0] = { why_wrong: 'x' }), /needs text, an image, or both/],
		['an option written as plain text', (q: Record<string, unknown>) => ((q.options as unknown[])[0] = 'Pine'), /put the option text after "text:"/],
		['an incorrect option without why_wrong', (q: Record<string, unknown>) => ((q.options as Record<string, unknown>[])[0] = { text: 'Pine' }), /is incorrect, so it needs a why_wrong/],
		['why_wrong on the correct option', (q: Record<string, unknown>) => ((q.options as Record<string, unknown>[])[1].why_wrong = 'x'), /is the correct answer, so it shouldn't have a why_wrong/],
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
});
