import { describe, expect, it } from 'vitest';
import type { AnswerRow, AttemptRow, History } from './history';
import {
	calibration,
	commandProfile,
	conceptCredits,
	dayKey,
	examTechnique,
	mistakeList,
	pace,
	attemptPace,
	specPointMastery,
	suggestNext,
	topicProgress,
	type QuizInfo
} from './progress';

const T0 = Date.UTC(2026, 9, 5, 9); // Mon 5 Oct 2026, 10:00 in London
const HOUR = 3600_000;
const at = (hours: number) => new Date(T0 + hours * HOUR).toISOString();

let nextAttempt = 1;
/** One saved answer. Defaults: a correct, Sure, single-question answer in topic mode, at T0. */
function answer(extra: Partial<AnswerRow> = {}): AnswerRow {
	return {
		attempt_id: nextAttempt,
		mode: 'topic',
		answered_at: at(0),
		question_id: 'q-1',
		quiz_id: 'timber',
		spec_point: '2.1.2.2',
		concept: 'c-1',
		command: 'identify',
		qtype: 'single',
		skill_format: null,
		dont_know: 0,
		not_reached: 0,
		confidence: 'sure',
		marks: 1,
		max_marks: 1,
		correct: 1,
		...extra
	};
}
const wrong = (extra: Partial<AnswerRow> = {}) => answer({ marks: 0, correct: 0, ...extra });

const history = (answers: AnswerRow[], attempts: AttemptRow[] = [], pages: History['pages'] = []): History => ({
	answers,
	attempts,
	pages
});

const timber: QuizInfo = { id: 'timber', title: 'Timber', unit: '2.1.2', page: '/gcse/unit2/timber/', concepts: 5, question_ids: [] };

/** Five concepts, all answered with the given credit, at the given hours. */
function fiveConcepts(credit: number, hours: number[] = [0, 0, 0, 0, 24]) {
	return hours.map((h, i) =>
		answer({ question_id: `q-${i}`, concept: `c-${i}`, marks: credit, correct: credit === 1 ? 1 : 0, answered_at: at(h) })
	);
}

describe('concept credit', () => {
	it('is the most recent answer to any question with that concept', () => {
		const credits = conceptCredits([
			answer({ question_id: 'q-1', answered_at: at(0) }),
			wrong({ question_id: 'q-2', answered_at: at(1) }) // same concept, different wording
		]);
		expect(credits.get('timber\0c-1')!.credit).toBe(0);
	});

	it('is marks / max_marks, so partial credit counts', () => {
		const credits = conceptCredits([answer({ qtype: 'multi', marks: 1, max_marks: 2, correct: 0 })]);
		expect(credits.get('timber\0c-1')!.credit).toBe(0.5);
	});

	it('is never affected by confidence', () => {
		const sure = conceptCredits([answer({ confidence: 'sure' })]);
		const guess = conceptCredits([answer({ confidence: 'guess' })]);
		expect(guess.get('timber\0c-1')!.credit).toBe(sure.get('timber\0c-1')!.credit);
	});

	it('scores "I don\'t know" as 0, the same as a wrong answer', () => {
		const credits = conceptCredits([answer({ dont_know: 1, marks: 0, correct: 0, confidence: null })]);
		expect(credits.get('timber\0c-1')!.credit).toBe(0);
	});

	it('leaves out exam_skill and "not reached" answers', () => {
		const credits = conceptCredits([
			answer({ qtype: 'exam_skill', concept: 'technique' }),
			wrong({ concept: 'c-2', not_reached: 1, mode: 'timed' })
		]);
		expect(credits.size).toBe(0);
	});
});

describe('practising mistakes can never lower topic mastery', () => {
	it('keeps the higher credit when a mistakes-mode answer is worse', () => {
		const before = [answer({ question_id: 'q-1', answered_at: at(0) }), wrong({ question_id: 'q-2', concept: 'c-2', answered_at: at(0) })];
		const mastery = (rows: AnswerRow[]) => topicProgress(timber, history(rows)).mastery!;
		const start = mastery(before);
		// Every possible mistakes-mode outcome, for both concepts.
		for (const c1 of [0, 1]) {
			for (const c2 of [0, 0.5, 1]) {
				const after = [
					...before,
					answer({ mode: 'mistakes', question_id: 'q-1', marks: c1, correct: c1, answered_at: at(30) }),
					answer({ mode: 'mistakes', question_id: 'q-2', concept: 'c-2', marks: c2 * 2, max_marks: 2, qtype: 'multi', correct: c2 === 1 ? 1 : 0, answered_at: at(30) })
				];
				expect(mastery(after)).toBeGreaterThanOrEqual(start);
			}
		}
	});

	it('still raises credit when the mistake is fixed', () => {
		const rows = [wrong({ answered_at: at(0) }), answer({ mode: 'mistakes', answered_at: at(30) })];
		expect(topicProgress(timber, history(rows)).mastery).toBe(1);
	});

	it('lets other modes lower it (a later wrong answer is the latest evidence)', () => {
		const rows = [answer({ answered_at: at(0) }), wrong({ mode: 'mixed', answered_at: at(30) })];
		expect(topicProgress(timber, history(rows)).mastery).toBe(0);
	});
});

describe('topic status', () => {
	const now = T0 + 48 * HOUR;

	it('is Not started with no answers', () => {
		expect(topicProgress(timber, history([]), now)).toMatchObject({ status: 'not_started', label: 'Not started' });
	});

	it('is Secure with mastery and coverage of 80%+ and answers 20+ hours apart', () => {
		const p = topicProgress(timber, history(fiveConcepts(1, [0, 0, 0, 0, 20])), now);
		expect(p).toMatchObject({ status: 'secure', label: 'Secure', mastery: 1, coverage: 1, spacing_met: true });
	});

	it('needs the 20-hour spacing: answers either side of midnight are not enough', () => {
		// 23:00 and 01:00 the next day: two dates, but only 2 hours apart.
		const p = topicProgress(timber, history(fiveConcepts(1, [13, 13, 13, 13, 15])), now);
		expect(p).toMatchObject({ status: 'getting_there', note: 'come back another day to lock it in', spacing_met: false });
		expect(topicProgress(timber, history(fiveConcepts(1, [0, 0, 0, 0, 19.9])), now).spacing_met).toBe(false);
	});

	it('says to try more questions when coverage is below 80%', () => {
		// 5 concepts answered, all right and well spaced, but the quiz has 10.
		const p = topicProgress({ ...timber, concepts: 10 }, history(fiveConcepts(1, [0, 0, 0, 0, 24])), now);
		expect(p).toMatchObject({ coverage: 0.5, status: 'getting_there', note: 'try more questions on this topic' });
		// 8 of 10 is enough.
		const eight = Array.from({ length: 8 }, (_, i) => answer({ question_id: `q-${i}`, concept: `c-${i}`, answered_at: at(i === 7 ? 24 : 0) }));
		expect(topicProgress({ ...timber, concepts: 10 }, history(eight), now).status).toBe('secure');
	});

	it('is Getting there from 50% mastery, and Not secure yet below it', () => {
		expect(topicProgress(timber, history(fiveConcepts(0.5)), now)).toMatchObject({ status: 'getting_there', label: 'Getting there' });
		expect(topicProgress(timber, history(fiveConcepts(0.4)), now)).toMatchObject({ status: 'not_secure', label: 'Not secure yet' });
	});

	it('shows a Secure topic not practised for 28 days as due for review', () => {
		const p = topicProgress(timber, history(fiveConcepts(1, [0, 0, 0, 0, 24])), T0 + 24 * HOUR + 29 * 24 * HOUR);
		expect(p).toMatchObject({ status: 'getting_there', note: 'due for review', due_for_review: true });
	});

	it('ignores exam_skill answers for coverage', () => {
		const rows = [answer(), ...[1, 2, 3, 4].map((i) => answer({ qtype: 'exam_skill', concept: `skill-${i}`, question_id: `s-${i}` }))];
		expect(topicProgress(timber, history(rows), now).coverage).toBe(0.2);
	});
});

describe('starting point, best and latest', () => {
	const attempt = (id: number, score: number, started: number): AttemptRow => ({
		id,
		mode: 'topic',
		quiz_id: 'timber',
		score,
		max_score: 10,
		question_count: 10,
		time_limit_s: null,
		time_taken_s: null,
		overtime: 0,
		started_at: at(started),
		completed_at: at(started + 0.2)
	});

	it('compares the first topic attempt with the best and the latest', () => {
		const p = topicProgress(timber, history([answer()], [attempt(1, 4, 0), attempt(2, 9, 24), attempt(3, 7, 48)]));
		expect(p).toMatchObject({ starting_point: 0.4, best: 0.9, latest: 0.7 });
		expect(p.improvement).toBeCloseTo(0.3);
	});

	it('records whether the starting point came before or after the notes were viewed', () => {
		const attempts = [attempt(1, 4, 5)];
		const viewed = (h: number) => [{ page_path: '/gcse/unit2/timber/', first_viewed: at(h), last_viewed: at(h), view_count: 1 }];
		expect(topicProgress(timber, history([answer()], attempts, viewed(8))).before_notes).toBe(true);
		expect(topicProgress(timber, history([answer()], attempts, viewed(2))).before_notes).toBe(false);
		expect(topicProgress(timber, history([answer()], attempts, [])).before_notes).toBe(true);
	});

	it('ignores other modes', () => {
		const mixed = { ...attempt(1, 10, 0), mode: 'mixed' as const, quiz_id: null };
		expect(topicProgress(timber, history([answer()], [mixed])).starting_point).toBeUndefined();
	});
});

describe('spec points and command words', () => {
	it('gives spec-point mastery across quizzes', () => {
		const rows = [answer({ spec_point: 'A' }), wrong({ quiz_id: 'metals', spec_point: 'A' }), answer({ concept: 'c-2', spec_point: 'B' })];
		expect(specPointMastery(rows)).toEqual([
			{ spec_point: 'A', mastery: 0.5, concepts: 2 },
			{ spec_point: 'B', mastery: 1, concepts: 1 }
		]);
	});

	it('profiles command words from knowledge questions only', () => {
		const rows = [answer({ command: 'state' }), wrong({ question_id: 'q-2', command: 'state' }), answer({ question_id: 's', qtype: 'exam_skill', command: 'explain' })];
		expect(commandProfile(rows)).toEqual([{ command: 'state', credit: 0.5, answers: 2 }]);
	});
});

describe('exam technique', () => {
	const skill = (format: string, command: string, right: boolean, i: number) =>
		answer({ qtype: 'exam_skill', skill_format: format, command, question_id: `s-${i}`, concept: `s-${i}`, marks: right ? 1 : 0, correct: right ? 1 : 0, answered_at: at(i) });

	it('is null with no exam_skill answers', () => {
		expect(examTechnique([answer()])).toBeNull();
	});

	it('gives credit overall, by format and by command word, with the weakest of each', () => {
		const rows = [
			skill('best_answer', 'explain', true, 1),
			skill('best_answer', 'explain', true, 2),
			skill('command_word', 'explain', false, 3),
			skill('command_word', 'describe', false, 4)
		];
		const t = examTechnique(rows)!;
		expect(t).toMatchObject({ answers: 4, credit: 0.5, status: 'getting_there', weakest_format: 'command_word', weakest_command: 'describe' });
		expect(t.by_format).toContainEqual(expect.objectContaining({ key: 'best_answer', credit: 1, label: 'Secure' }));
	});

	it('uses only the latest 20', () => {
		const rows = [...Array.from({ length: 10 }, (_, i) => skill('best_answer', 'explain', false, i)), ...Array.from({ length: 20 }, (_, i) => skill('best_answer', 'explain', true, 10 + i))];
		expect(examTechnique(rows)!.credit).toBe(1);
	});
});

describe('timed practice', () => {
	const timedAttempt = (id: number, taken: number, overtime = 0): AttemptRow => ({
		id, mode: 'timed', quiz_id: null, score: 3, max_score: 4, question_count: 4,
		time_limit_s: 180, time_taken_s: taken, overtime, started_at: at(id), completed_at: at(id + 0.1)
	});
	const rowsFor = (id: number, notReached: number) =>
		[0, 1, 2, 3].map((i) => answer({ attempt_id: id, mode: 'timed', question_id: `q-${i}`, not_reached: i < 4 - notReached ? 0 : 1 }));

	it('works out the pace of one attempt, and flags overtime', () => {
		const rows = [0, 1, 2, 3].map((i) => ({ not_reached: i === 3, max_marks: 1 }));
		expect(attemptPace(rows, 120, 180)).toMatchObject({ reached: 3, total: 4, seconds_per_question: 40, target_seconds_per_question: 45, overtime: false });
		expect(attemptPace(rows, 211, 180).overtime).toBe(true);
		expect(attemptPace(rows, 210, 180).overtime).toBe(false);
	});

	it('averages pace over timed attempts, leaving out overtime ones', () => {
		const h = history([...rowsFor(1, 0), ...rowsFor(2, 2), ...rowsFor(3, 0)], [timedAttempt(1, 120), timedAttempt(2, 60), timedAttempt(3, 999, 1)]);
		const p = pace(h)!;
		expect(p.attempts).toBe(2);
		expect(p.reached).toBe(0.75); // (4/4 + 2/4) / 2
		expect(p.seconds_per_mark).toBe(30); // (120/4 + 60/2) / 2
		expect(p.latest_score).toBe(0.75);
	});

	it('leaves "not reached" out of mastery, mistakes and confidence figures', () => {
		const rows = [answer(), wrong({ question_id: 'q-2', concept: 'c-2', not_reached: 1, confidence: null, mode: 'timed' })];
		expect(topicProgress(timber, history(rows)).mastery).toBe(1);
		expect(mistakeList(rows)).toEqual([]);
		expect(calibration(rows).rated).toBe(1);
	});
});

describe('calibration', () => {
	const rated = (sureRight: number, sureWrong: number, guessRight: number, guessWrong: number) => [
		...Array.from({ length: sureRight }, () => answer({ confidence: 'sure' })),
		...Array.from({ length: sureWrong }, () => wrong({ confidence: 'sure' })),
		...Array.from({ length: guessRight }, () => answer({ confidence: 'guess' })),
		...Array.from({ length: guessWrong }, () => wrong({ confidence: 'guess' }))
	];

	it('waits for 20 rated answers', () => {
		expect(calibration(rated(19, 0, 0, 0))).toMatchObject({ shown: false, rated: 19, messages: [] });
	});

	it('praises Sure answers that are right 85%+ of the time', () => {
		const c = calibration(rated(17, 3, 0, 0));
		expect(c.sure).toEqual({ answers: 20, right: 0.85 });
		expect(c.messages).toEqual(["When you say you're sure, you're usually right — good self-awareness."]);
	});

	it('warns when Sure answers are right less than 70% of the time', () => {
		expect(calibration(rated(13, 7, 0, 0)).messages).toEqual([
			"You're often sure about answers that turn out wrong. Slow down and check before choosing."
		]);
	});

	it('tells underconfident students they know more than they think', () => {
		const c = calibration(rated(17, 3, 6, 4));
		expect(c.messages).toHaveLength(2);
		expect(c.messages[1]).toMatch(/You know more than you think/);
		// Needs at least 10 guesses.
		expect(calibration(rated(17, 3, 6, 3)).messages).toHaveLength(1);
	});

	it('ignores "I don\'t know" (no rating)', () => {
		const c = calibration([...rated(20, 0, 0, 0), answer({ dont_know: 1, confidence: null, marks: 0, correct: 0 })]);
		expect(c.rated).toBe(20);
	});
});

describe('Practise my mistakes', () => {
	it('includes wrong, guessed and "I don\'t know" answers, most recent first', () => {
		const rows = [
			wrong({ question_id: 'a', answered_at: at(0) }),
			answer({ question_id: 'b', confidence: 'guess', answered_at: at(1) }),
			answer({ question_id: 'c', dont_know: 1, marks: 0, correct: 0, confidence: null, answered_at: at(2) }),
			answer({ question_id: 'd', answered_at: at(3) }) // right and Sure: not a mistake
		];
		expect(mistakeList(rows).map((m) => m.question_id)).toEqual(['c', 'b', 'a']);
	});

	it('only clears a mistake answered right and Sure on a LATER DAY', () => {
		const mistake = wrong({ answered_at: at(0) }); // Monday 10:00
		const sameDay = answer({ answered_at: at(8) }); // Monday 18:00
		const nextDay = answer({ answered_at: at(14) }); // Tuesday 00:00
		expect(mistakeList([mistake, sameDay])).toHaveLength(1);
		expect(mistakeList([mistake, sameDay, nextDay])).toHaveLength(0);
	});

	it("doesn't clear with a later-day guess, even if right", () => {
		expect(mistakeList([wrong({ answered_at: at(0) }), answer({ confidence: 'guess', answered_at: at(30) })])).toHaveLength(1);
	});

	it('uses UK calendar days', () => {
		// 23:30 UTC on 25 Oct 2026 is 23:30 GMT (clocks went back that morning); 00:30 UTC is the next day.
		expect(dayKey('2026-10-25T23:30:00.000Z')).toBe('2026-10-25');
		expect(dayKey('2026-07-01T23:30:00.000Z')).toBe('2026-07-02'); // BST
	});

	it('puts a question back if it goes wrong again after being cleared', () => {
		const rows = [wrong({ answered_at: at(0) }), answer({ answered_at: at(30) }), wrong({ answered_at: at(60) })];
		expect(mistakeList(rows)).toHaveLength(1);
	});
});

describe('suggested next', () => {
	const t = (extra: Partial<Parameters<typeof suggestNext>[0][number]>) => ({
		quiz_id: 'x', title: 'X', unit: '', page: '/x/', status: 'not_started' as const, label: '', notes_viewed: false, ...extra
	});

	it('puts mistakes first, then due for review, then the weakest topic, then a new one', () => {
		const topics = [t({ quiz_id: 'new', title: 'New' }), t({ quiz_id: 'weak', title: 'Weak', status: 'not_secure', mastery: 0.2 }), t({ quiz_id: 'due', title: 'Due', status: 'getting_there', due_for_review: true, mastery: 0.9 })];
		expect(suggestNext(topics, 3)!.kind).toBe('mistakes');
		expect(suggestNext(topics, 0)).toMatchObject({ kind: 'review', quiz_id: 'due' });
		expect(suggestNext(topics.slice(0, 2), 0)).toMatchObject({ kind: 'weakest', quiz_id: 'weak' });
		expect(suggestNext(topics.slice(0, 1), 0)).toMatchObject({ kind: 'new', quiz_id: 'new' });
	});
});
