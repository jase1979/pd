import { describe, expect, it } from 'vitest';
import { QuizError, quizMeta, startAttempt, submitAttempt, servableQuestions } from './attempts';
import { bestAnswer, multi, question, quiz, seeded, twoTier } from './fixtures';
import type { Quiz } from './types';

const secret = 'test-secret';
const now = Date.UTC(2026, 9, 19, 12);

async function begin(q: Quiz, environment = 'production') {
	return startAttempt(q, environment, secret, { random: seeded(), now });
}

/** Answer every served question with the given option (or "I don't know" for null). */
function answerAll(questions: { id: string }[], chosen: number | null, confidence: 'sure' | 'guess' = 'sure') {
	return questions.map((q) =>
		chosen === null
			? { question_id: q.id, chosen: null, dont_know: true, confidence: null }
			: { question_id: q.id, chosen, dont_know: false, confidence }
	);
}

describe('draft questions', () => {
	const mixed = quiz(8);
	mixed.questions.slice(0, 4).forEach((q) => (q.status = 'draft'));

	it('are only served in dev and preview', () => {
		expect(servableQuestions(mixed, 'production')).toHaveLength(4);
		expect(servableQuestions(mixed, 'dev')).toHaveLength(8);
		expect(servableQuestions(mixed, 'preview')).toHaveLength(8);
	});

	it('hide a quiz with fewer than 5 reviewed questions on the live site', async () => {
		expect(quizMeta(mixed, 'production').available).toBe(false);
		expect(quizMeta(mixed, 'dev').available).toBe(true);
		await expect(begin(mixed, 'production')).rejects.toThrow(QuizError);
	});

	it('are never in a production attempt', async () => {
		const live = quiz(10);
		live.questions.slice(0, 4).forEach((q) => (q.status = 'draft'));
		for (let seed = 1; seed <= 20; seed++) {
			const { questions } = await startAttempt(live, 'production', secret, { random: seeded(seed), now });
			expect(questions.map((q) => q.id)).not.toContain('q-1');
			expect(questions.every((q) => !['q-1', 'q-2', 'q-3', 'q-4'].includes(q.id))).toBe(true);
		}
	});
});

describe('quizMeta', () => {
	it('needs 5 knowledge questions; exam technique alone doesn\'t count', () => {
		const q = quiz(4);
		q.questions.push(bestAnswer('b-1', 'b-1'), bestAnswer('b-2', 'b-2'));
		expect(quizMeta(q, 'production').available).toBe(false);
		q.questions.push(question('q-5', 'concept-5'));
		expect(quizMeta(q, 'production')).toMatchObject({ available: true, questions_per_attempt: 7 });
	});

	it('counts concepts, not questions', () => {
		// 6 questions but 4 concepts: not enough for the minimum of 5.
		expect(quizMeta(quiz(6, {}, ['a', 'a', 'b', 'b', 'c', 'd']), 'production').available).toBe(false);
		expect(quizMeta(quiz(6, {}, ['a', 'a', 'b', 'c', 'd', 'e']), 'production')).toMatchObject({
			available: true,
			questions_per_attempt: 5
		});
	});
});

describe('startAttempt', () => {
	it('sends no answers, explanations, why_wrong or marks to the browser, for any type', async () => {
		const q = quiz(5, {
			scenarios: [{ id: 'bench', text: 'A park bench.' }],
			past_papers: [{ title: 'Paper', url: '/past-papers/#s24-q6' }]
		});
		q.questions.push(
			multi('m-1', 'm'),
			twoTier('t-1', 't'),
			bestAnswer('b-1', 'b', { scenario: 'bench' }),
			question('c-1', 'c', { command: 'calculate', working: 'Secret working.' })
		);
		const { questions } = await begin(q);
		const sent = JSON.stringify(questions);
		for (const secret of ['"answer":', 'explanation', 'why_wrong', 'Because', 'Not a reason', 'No reason given', 'Right is right', 'marks_awarded', 'working', 'Secret', 'concept', 'see', 'status', 'past-papers']) {
			expect(sent).not.toContain(secret);
		}
	});

	it('sends what each type needs to be shown', async () => {
		const q = quiz(5, { scenarios: [{ id: 'bench', text: 'A park bench.' }], exam_skills_per_attempt: 1 });
		q.questions.push(multi('m-1', 'm'), twoTier('t-1', 't'), bestAnswer('b-1', 'b', { scenario: 'bench' }));
		const { questions } = await begin(q);
		const byId = Object.fromEntries(questions.map((x) => [x.id, x]));
		expect(byId['m-1'].select).toBe(2);
		expect(byId['t-1'].reason).toEqual({ text: 'Why?', options: [{ text: 'Good reason' }, { text: 'Bad reason' }] });
		expect(byId['b-1']).toMatchObject({
			format: 'best_answer',
			exam_question: { text: 'Explain why.', marks: 2 },
			scenario: { id: 'bench', text: 'A park bench.' }
		});
		expect(questions.at(-1)!.id).toBe('b-1'); // exam technique comes last
	});
});

describe('submitAttempt', () => {
	const q = quiz(10);
	const lookup = (id: string) => (id === q.id ? q : undefined);

	it('marks every answer and totals the score', async () => {
		const { token, questions } = await begin(q);
		const answers = answerAll(questions, 0);
		answers[0] = { question_id: questions[0].id, chosen: 1, dont_know: false, confidence: 'guess' };
		answers[1] = { question_id: questions[1].id, chosen: null, dont_know: true, confidence: null };
		const res = await submitAttempt({ token, answers }, secret, lookup, now);
		expect(res.max_score).toBe(10);
		expect(res.score).toBe(8);
		expect(res.results.map((r) => r.question_id)).toEqual(questions.map((x) => x.id));
		expect(res.results[0]).toMatchObject({ correct: false, chosen: 1, confidence: 'guess', answer: 0 });
		expect(res.results[1]).toMatchObject({ correct: false, dont_know: true, confidence: null });
	});

	it('includes why_wrong for every option of a question not answered correctly', async () => {
		const { token, questions } = await begin(q);
		const res = await submitAttempt({ token, answers: answerAll(questions, 1) }, secret, lookup, now);
		for (const r of res.results) {
			expect(r.why_wrong).toEqual([null, 'Because A.', 'Because B.']);
			expect(r.explanation).toBe('Right is right.');
			expect(r.see).toBe('/gcse/unit2/timber/#hardwoods');
		}
	});

	it('includes why_wrong for "I don\'t know" answers too', async () => {
		const { token, questions } = await begin(q);
		const res = await submitAttempt({ token, answers: answerAll(questions, null) }, secret, lookup, now);
		expect(res.results.every((r) => r.why_wrong?.length === 3)).toBe(true);
	});

	it('leaves why_wrong out for correct answers', async () => {
		const { token, questions } = await begin(q);
		const res = await submitAttempt({ token, answers: answerAll(questions, 0) }, secret, lookup, now);
		expect(res.results.every((r) => r.why_wrong === undefined)).toBe(true);
	});

	it('rejects a modified token', async () => {
		const { token, questions } = await begin(q);
		const tampered = token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
		await expect(submitAttempt({ token: tampered, answers: answerAll(questions, 0) }, secret, lookup, now)).rejects.toMatchObject({ status: 400 });
	});

	it('rejects an expired token', async () => {
		const { token, questions } = await begin(q);
		const later = now + 2 * 60 * 60 * 1000 + 1;
		await expect(submitAttempt({ token, answers: answerAll(questions, 0) }, secret, lookup, later)).rejects.toMatchObject({ status: 400 });
	});

	it('rejects answers that don\'t match the served questions', async () => {
		const { token, questions } = await begin(q);
		const all = answerAll(questions, 0);
		const cases = [
			all.slice(1), // one missing
			[...all, all[0]], // a duplicate
			[...all.slice(1), { ...all[0], question_id: 'q-999' }] // a swapped-in question
		];
		for (const answers of cases) {
			await expect(submitAttempt({ token, answers }, secret, lookup, now)).rejects.toMatchObject({ status: 400 });
		}
	});

	it('rejects badly formed answers', async () => {
		const { token, questions } = await begin(q);
		const id = questions[0].id;
		const rest = answerAll(questions.slice(1), 0);
		for (const bad of [
			{ question_id: id, chosen: null, dont_know: false, confidence: 'sure' }, // no answer
			{ question_id: id, chosen: 0, dont_know: false, confidence: null }, // no confidence
			{ question_id: id, chosen: 7, dont_know: false, confidence: 'sure' }, // no such option
			{ question_id: id, chosen: '0', dont_know: false, confidence: 'sure' }
		]) {
			await expect(submitAttempt({ token, answers: [bad, ...rest] }, secret, lookup, now)).rejects.toMatchObject({ status: 400 });
		}
	});

	it('asks for a restart if a served question has since been removed', async () => {
		const { token, questions } = await begin(q);
		const smaller = { ...q, questions: q.questions.filter((x) => x.id !== questions[0].id) };
		await expect(
			submitAttempt({ token, answers: answerAll(questions, 0) }, secret, () => smaller, now)
		).rejects.toMatchObject({ status: 409 });
	});

	describe('with every question type', () => {
		const mixed = quiz(5, { past_papers: [{ title: 'Paper', url: '/past-papers/#s24-q6' }], exam_skills_per_attempt: 1 });
		mixed.questions.push(
			multi('m-1', 'm'),
			twoTier('t-1', 't'),
			bestAnswer('b-1', 'b'),
			question('c-1', 'c', { command: 'calculate', working: 'Step 1, step 2.' })
		);
		const find = (res: Awaited<ReturnType<typeof submitAttempt>>, id: string) => res.results.find((r) => r.question_id === id)!;

		async function submitWith(choices: Record<string, unknown>, confidence: 'sure' | 'guess' = 'sure') {
			const { token, questions } = await begin(mixed);
			// Anything not in `choices` gets the right answer.
			const right: Record<string, unknown> = { 'm-1': [0, 1], 't-1': { answer: 0, reason: 0 }, 'b-1': 2 };
			const answers = questions.map((x) => ({
				question_id: x.id,
				chosen: x.id in choices ? choices[x.id] : (right[x.id] ?? 0),
				dont_know: false,
				confidence
			}));
			return submitAttempt({ token, answers }, secret, () => mixed, now);
		}

		it('marks each type and totals the marks', async () => {
			const res = await submitWith({ 'm-1': [0, 2], 't-1': { answer: 0, reason: 1 }, 'b-1': 2 });
			expect(find(res, 'm-1')).toMatchObject({ marks: 1, max_marks: 2, correct: false, answer: [0, 1] });
			expect(find(res, 't-1')).toMatchObject({ marks: 1, max_marks: 2, correct: false, answer: { answer: 0, reason: 0 } });
			expect(find(res, 'b-1')).toMatchObject({ marks: 1, correct: true });
			// 6 singles right (6) + multi 1 of 2 + two-tier 1 of 2 + best answer 1 of 1
			expect(res.score).toBe(9);
			expect(res.max_score).toBe(11);
		});

		it('includes why_wrong for every option, and every reason, of a two-tier question not fully correct', async () => {
			const res = await submitWith({ 't-1': { answer: 0, reason: 1 } });
			expect(find(res, 't-1').why_wrong).toEqual([null, 'Because A.', 'Because B.']);
			expect(find(res, 't-1').reason_why_wrong).toEqual([null, 'Not a reason.']);
		});

		it('includes why_wrong for guessed answers, even correct ones, for "Try again now"', async () => {
			const res = await submitWith({ 'm-1': [0, 1], 't-1': { answer: 0, reason: 0 } }, 'guess');
			for (const r of res.results) {
				expect(r.correct).toBe(true);
				expect(r.why_wrong).toBeDefined();
			}
			expect(find(res, 't-1').reason_why_wrong).toEqual([null, 'Not a reason.']);
		});

		it('always shows every best_answer sample\'s marks and reasons', async () => {
			const res = await submitWith({ 'b-1': 2 });
			expect(find(res, 'b-1')).toMatchObject({
				correct: true,
				marks_awarded: [0, 1, 2],
				why_wrong: ['No reason given.', 'Not linked to the product.', null]
			});
		});

		it('includes the worked solution for calculations', async () => {
			const res = await submitWith({});
			expect(find(res, 'c-1').working).toBe('Step 1, step 2.');
		});

		it('returns the past paper links', async () => {
			const res = await submitWith({});
			expect(res.past_papers).toEqual([{ title: 'Paper', url: '/past-papers/#s24-q6' }]);
		});

		it.each([
			['a multi answer with the wrong number of options', 'm-1', [0]],
			['a multi answer that is not a list', 'm-1', 0],
			['a two-tier answer without a reason', 't-1', { answer: 0 }],
			['a two-tier answer as a number', 't-1', 0]
		])('rejects %s', async (_name, id, chosen) => {
			await expect(submitWith({ [id]: chosen })).rejects.toMatchObject({ status: 400 });
		});
	});

	it('uses the question as stored, not anything the browser sends', async () => {
		const one = quiz(5);
		one.questions[0] = question('q-1', 'concept-1', { answer: 2, options: [{ text: 'A', why_wrong: 'x' }, { text: 'B', why_wrong: 'y' }, { text: 'C' }] });
		const { token, questions } = await begin(one);
		const answers = answerAll(questions, 0).map((a) => (a.question_id === 'q-1' ? { ...a, chosen: 2 } : a));
		const res = await submitAttempt({ token, answers }, secret, () => one, now);
		expect(res.results.find((r) => r.question_id === 'q-1')).toMatchObject({ correct: true, answer: 2 });
	});
});
