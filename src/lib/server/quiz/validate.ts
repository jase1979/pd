// Checks the quiz YAML files and turns them into a QuizBank. Any error fails
// the build (see vite-plugin.ts), with a message naming the file and question.
// Things worth fixing that shouldn't stop a build are warnings (warnings.ts).
//
// Pure: it doesn't touch the file system itself. The caller says which images
// and pages exist, so the tests can run without real files.

import { DEFAULT_EXAM_SKILLS_PER_ATTEMPT } from '../config';
import {
	COMMANDS,
	QUESTION_TYPES,
	SKILL_FORMATS,
	SPECS,
	STATUSES,
	type Question,
	type Quiz,
	type Scenario
} from './types';
import type { PastPaperLink, QuestionType } from '$lib/quiz/public';

export interface QuizFile {
	/** Path shown in error messages, e.g. content/quizzes/legacy-u2-timber.yml */
	path: string;
	/** The parsed YAML. */
	data: unknown;
}

export interface ValidateOptions {
	/** Does /assets/quiz-images/... exist under static/? */
	imageExists: (url: string) => boolean;
	/** Is there a topic page at this URL, e.g. /gcse/unit2/timber/? */
	pageExists: (url: string) => boolean;
}

const QUIZ_FIELDS = [
	'id', 'spec', 'unit', 'topic', 'page', 'questions_per_attempt', 'exam_skills_per_attempt',
	'past_papers', 'scenarios', 'questions'
];
const QUIZ_REQUIRED = ['id', 'spec', 'unit', 'topic', 'page', 'questions_per_attempt', 'questions'];

const QUESTION_FIELDS = [
	'id', 'type', 'status', 'spec_point', 'concept', 'command', 'see', 'text', 'image', 'image_alt',
	'scenario', 'context', 'options', 'answer', 'explanation', 'working'
];
/** Fields only some types may have. */
const EXTRA_FIELDS: Record<QuestionType, string[]> = {
	single: [],
	multi: [],
	two_tier: ['reason'],
	exam_skill: ['format', 'exam_question', 'sample_answer']
};
const QUESTION_REQUIRED = ['id', 'status', 'spec_point', 'concept', 'command', 'text', 'options', 'answer', 'explanation'];

const OPTION_FIELDS = ['text', 'image', 'image_alt', 'why_wrong', 'marks_awarded'];

// Quiz, question and scenario ids appear in URLs and the database, so keep them simple.
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Obj = Record<string, unknown>;
type Err = (msg: string) => void;

const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isIndex = (v: unknown, n: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;

export function validateQuizzes(
	files: QuizFile[],
	opts: ValidateOptions
): { quizzes: Quiz[]; errors: string[] } {
	const errors: string[] = [];
	const quizzes: Quiz[] = [];
	const quizIds = new Map<string, string>(); // quiz id -> file
	const questionIds = new Map<string, string>(); // question id -> file
	const pages = new Map<string, string>(); // page -> quiz id

	for (const file of files) {
		const fileErrors: string[] = [];
		const err: Err = (msg) => fileErrors.push(`${file.path}: ${msg}`);
		const quiz = file.data;

		if (!isObject(quiz)) {
			err('the file should be a quiz (id, spec, topic, questions, ...), not a list or plain text');
			errors.push(...fileErrors);
			continue;
		}

		for (const key of Object.keys(quiz)) {
			if (!QUIZ_FIELDS.includes(key)) err(`unknown field "${key}"`);
		}
		for (const key of QUIZ_REQUIRED) {
			if (quiz[key] === undefined || quiz[key] === null) err(`missing required field "${key}"`);
		}

		const id = quiz.id;
		if (quiz.id !== undefined) {
			if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
				err(`id "${id}" should be lower-case words joined by dashes, e.g. legacy-u2-timber`);
			} else {
				// The file name matches the id, so a quiz is easy to find from its id.
				const expected = `${id}.yml`;
				if (!file.path.endsWith('/' + expected) && file.path !== expected) {
					err(`id "${id}" doesn't match the file name; rename the file to ${expected}`);
				}
				const other = quizIds.get(id);
				if (other) err(`duplicate quiz id "${id}" (also used in ${other})`);
				else quizIds.set(id, file.path);
			}
		}

		if (quiz.spec !== undefined && !SPECS.includes(quiz.spec as never)) {
			err(`spec "${quiz.spec}" should be one of: ${SPECS.join(', ')}`);
		}
		for (const key of ['unit', 'topic'] as const) {
			if (quiz[key] !== undefined && !isText(quiz[key])) err(`"${key}" should be text`);
		}
		if (quiz.page !== undefined) {
			if (typeof quiz.page !== 'string' || !opts.pageExists(quiz.page)) {
				err(`page "${quiz.page}" isn't a topic page on the site (it should look like /gcse/unit2/timber/)`);
			} else {
				const other = pages.get(quiz.page);
				if (other) err(`page ${quiz.page} already has a quiz ("${other}"); a page can only have one`);
				else pages.set(quiz.page, String(id));
			}
		}
		const perAttempt = quiz.questions_per_attempt;
		if (perAttempt !== undefined && !(Number.isInteger(perAttempt) && (perAttempt as number) > 0)) {
			err('questions_per_attempt should be a whole number above 0');
		}
		const skillsPerAttempt = quiz.exam_skills_per_attempt ?? DEFAULT_EXAM_SKILLS_PER_ATTEMPT;
		if (!(Number.isInteger(skillsPerAttempt) && (skillsPerAttempt as number) >= 0)) {
			err('exam_skills_per_attempt should be a whole number (0 or more)');
		}

		const pastPapers = checkPastPapers(quiz.past_papers, err);
		const scenarios = checkScenarios(quiz.scenarios, err, opts);
		const scenarioIds = new Set(scenarios.map((s) => s.id));

		const questions: Question[] = [];
		if (quiz.questions !== undefined) {
			if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
				err('"questions" should be a list with at least one question');
			} else {
				quiz.questions.forEach((q, i) => {
					const where = isObject(q) && isText(q.id) ? `question ${q.id}` : `question ${i + 1}`;
					const before = fileErrors.length;
					checkQuestion(q, (msg) => err(`${where}: ${msg}`), opts, scenarioIds);
					if (isObject(q) && typeof q.id === 'string') {
						const other = questionIds.get(q.id);
						if (other) err(`${where}: duplicate question id (also used in ${other})`);
						else questionIds.set(q.id, file.path);
					}
					if (fileErrors.length === before) questions.push(normalise(q as Obj));
				});
			}
		}

		if (fileErrors.length === 0) {
			const page = String(quiz.page);
			quizzes.push({
				id: String(id),
				spec: quiz.spec as Quiz['spec'],
				unit: String(quiz.unit),
				topic: String(quiz.topic),
				page,
				questions_per_attempt: perAttempt as number,
				exam_skills_per_attempt: skillsPerAttempt as number,
				past_papers: pastPapers,
				scenarios,
				// A bare "#anchor" is on the quiz's own page.
				questions: questions.map((q) => (q.see?.startsWith('#') ? { ...q, see: page + q.see } : q))
			});
		}
		errors.push(...fileErrors);
	}

	return { quizzes, errors };
}

function checkPastPapers(raw: unknown, err: Err): PastPaperLink[] {
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) {
		err('"past_papers" should be a list of links, each with a title and url');
		return [];
	}
	raw.forEach((link, i) => {
		const where = `past_papers ${i + 1}`;
		if (!isObject(link)) return err(`${where} should have a title and a url`);
		for (const key of Object.keys(link)) if (key !== 'title' && key !== 'url') err(`${where}: unknown field "${key}"`);
		if (!isText(link.title)) err(`${where}: missing "title"`);
		if (!(typeof link.url === 'string' && /^\/\S*$/.test(link.url))) {
			err(`${where}: url "${link.url}" should be a path on this site, e.g. /past-papers/#s24-q6`);
		}
	});
	return raw.filter(isObject).map((l) => ({ title: String(l.title), url: String(l.url) }));
}

function checkScenarios(raw: unknown, err: Err, opts: ValidateOptions): Scenario[] {
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) {
		err('"scenarios" should be a list, each with an id and text');
		return [];
	}
	const seen = new Set<string>();
	raw.forEach((s, i) => {
		const scenarioErr: Err = (msg) => err(`scenario ${isObject(s) && isText(s.id) ? s.id : i + 1}: ${msg}`);
		if (!isObject(s)) return scenarioErr('should have an id and text');
		for (const key of Object.keys(s)) {
			if (!['id', 'text', 'image', 'image_alt'].includes(key)) scenarioErr(`unknown field "${key}"`);
		}
		if (typeof s.id !== 'string' || !ID_PATTERN.test(s.id)) {
			scenarioErr(`id "${s.id}" should be lower-case words joined by dashes, e.g. garden-bench`);
		} else if (seen.has(s.id)) {
			scenarioErr('duplicate scenario id');
		} else {
			seen.add(s.id);
		}
		if (!isText(s.text)) scenarioErr('missing "text"');
		checkImage(s, scenarioErr, opts);
	});
	return raw.filter(isObject).map((s) => {
		const out: Scenario = { id: String(s.id), text: String(s.text) };
		if (s.image !== undefined) Object.assign(out, { image: s.image, image_alt: s.image_alt });
		return out;
	});
}

function checkQuestion(q: unknown, err: Err, opts: ValidateOptions, scenarioIds: Set<string>) {
	if (!isObject(q)) {
		err('should be a set of fields (id, text, options, ...), not plain text');
		return;
	}

	const type = (q.type ?? 'single') as QuestionType;
	if (!QUESTION_TYPES.includes(type)) {
		err(`unknown type "${q.type}" (use one of: ${QUESTION_TYPES.join(', ')})`);
		return; // the rest of the checks depend on the type
	}

	const allowed = [...QUESTION_FIELDS, ...EXTRA_FIELDS[type]];
	for (const key of Object.keys(q)) {
		if (allowed.includes(key)) continue;
		const owner = QUESTION_TYPES.find((t) => EXTRA_FIELDS[t].includes(key));
		err(owner ? `"${key}" is only for ${owner} questions` : `unknown field "${key}"`);
	}
	const required = [...QUESTION_REQUIRED, ...EXTRA_FIELDS[type].filter((f) => f !== 'sample_answer')];
	for (const key of required) {
		if (q[key] === undefined || q[key] === null) err(`missing required field "${key}"`);
	}

	if (q.id !== undefined && (typeof q.id !== 'string' || !ID_PATTERN.test(q.id))) {
		err(`id "${q.id}" should be lower-case words joined by dashes, e.g. timber-001`);
	}
	if (q.status !== undefined && !STATUSES.includes(q.status as never)) {
		err(`status "${q.status}" should be one of: ${STATUSES.join(', ')}`);
	}
	for (const key of ['spec_point', 'concept', 'text', 'explanation']) {
		if (q[key] !== undefined && !isText(q[key])) err(`"${key}" should be text`);
	}
	if (q.command !== undefined && !COMMANDS[type].includes(q.command as string)) {
		err(`command "${q.command}" isn't allowed for a ${type} question (use one of: ${COMMANDS[type].join(', ')})`);
	}
	if (q.see !== undefined && !(typeof q.see === 'string' && /^(#|\/)\S+$/.test(q.see))) {
		err(`see "${q.see}" should be a heading anchor like "#hardwoods" or a path like "/gcse/unit2/timber/#hardwoods"`);
	}
	if (q.scenario !== undefined && !scenarioIds.has(q.scenario as string)) {
		err(`scenario "${q.scenario}" isn't defined in this quiz's scenarios`);
	}
	if (q.context !== undefined && typeof q.context !== 'boolean') err('"context" should be true or false');
	if (q.working !== undefined) {
		if (q.command !== 'calculate') err('"working" is only for questions with command: calculate');
		else if (!isText(q.working)) err('"working" should be text');
	}
	checkImage(q, err, opts);

	if (!Array.isArray(q.options) || q.options.length < 2) {
		if (q.options !== undefined) err('"options" should be a list of at least two options');
		return;
	}

	const correct = checkAnswer(type, q.answer, q.options.length, err);
	const exam = type === 'exam_skill' ? checkExamSkill(q, err) : null;
	checkOptions(q.options, correct, err, opts, exam?.format === 'best_answer');

	if (type === 'two_tier') checkReason(q.reason, err, opts);

	// best_answer: the correct option must be the single highest-scoring sample.
	if (exam?.format === 'best_answer' && correct && exam.marks !== null) {
		const marks = (q.options as Obj[]).map((o) => (isObject(o) ? o.marks_awarded : undefined));
		marks.forEach((m, i) => {
			if (m === undefined) return; // reported by checkOptions
			if (!Number.isInteger(m) || (m as number) < 0 || (m as number) > exam.marks!) {
				err(`option ${i}: marks_awarded should be a whole number from 0 to ${exam.marks} (the exam question's marks)`);
			}
		});
		const best = marks[[...correct][0]] as number;
		if (marks.every((m) => Number.isInteger(m))) {
			const rivals = marks.filter((m, i) => !correct.has(i) && (m as number) >= best);
			if (rivals.length > 0) {
				err(`the correct answer (option ${[...correct][0]}, ${best} marks) must score more than every other sample answer`);
			}
		}
	}
}

/** Check `answer` for the type; returns the set of correct option indexes, or null if it's invalid. */
function checkAnswer(type: QuestionType, answer: unknown, count: number, err: Err): Set<number> | null {
	if (answer === undefined) return null;
	const range = `from 0 to ${count - 1} (counting from 0)`;
	if (type === 'multi') {
		if (!Array.isArray(answer)) {
			err(`answer should be a list of option numbers for a multi question, e.g. [0, 2], not ${JSON.stringify(answer)}`);
			return null;
		}
		const bad = answer.filter((a) => !isIndex(a, count));
		if (bad.length) err(`answer ${JSON.stringify(bad)} should only use option numbers ${range}`);
		if (new Set(answer).size !== answer.length) err('answer lists the same option twice');
		if (answer.length < 2 || answer.length >= count) {
			err(`a multi question needs at least 2 correct options and at least one wrong one (answer has ${answer.length} of ${count})`);
		}
		return bad.length || new Set(answer).size !== answer.length ? null : new Set(answer as number[]);
	}
	if (Array.isArray(answer)) {
		err(`answer should be a single number for a ${type} question, not a list (use type: multi for "Select TWO")`);
		return null;
	}
	if (!isIndex(answer, count)) {
		err(`answer ${JSON.stringify(answer)} should be the number of an option, ${range}`);
		return null;
	}
	return new Set([answer as number]);
}

/** Every option has text and/or an image; why_wrong on exactly the incorrect ones. */
function checkOptions(options: unknown[], correct: Set<number> | null, err: Err, opts: ValidateOptions, bestAnswer: boolean, prefix = 'option') {
	options.forEach((option, i) => {
		const optErr: Err = (msg) => err(`${prefix} ${i} (${optionLabel(option)}): ${msg}`);
		if (!isObject(option)) {
			optErr('should be a set of fields (text, why_wrong, ...); put the option text after "text:"');
			return;
		}
		for (const key of Object.keys(option)) {
			if (!OPTION_FIELDS.includes(key)) optErr(`unknown field "${key}"`);
		}
		if (!isText(option.text) && option.image === undefined) optErr('needs text, an image, or both');
		if (option.text !== undefined && !isText(option.text)) optErr('"text" should be text');
		checkImage(option, optErr, opts);
		if (bestAnswer && option.marks_awarded === undefined) optErr('needs marks_awarded (every best_answer sample does)');
		if (!bestAnswer && option.marks_awarded !== undefined) optErr('marks_awarded is only for exam_skill best_answer questions');
		if (!correct) return;
		if (correct.has(i) && option.why_wrong !== undefined) {
			optErr('is a correct answer, so it shouldn\'t have a why_wrong (put that in "explanation")');
		}
		if (!correct.has(i) && !isText(option.why_wrong)) {
			optErr('is incorrect, so it needs a why_wrong saying why');
		}
	});
}

function checkReason(reason: unknown, err: Err, opts: ValidateOptions) {
	if (reason === undefined) return; // reported as a missing field
	const reasonErr: Err = (msg) => err(`reason: ${msg}`);
	if (!isObject(reason)) return reasonErr('should have text, options and answer');
	for (const key of Object.keys(reason)) {
		if (!['text', 'options', 'answer'].includes(key)) reasonErr(`unknown field "${key}"`);
	}
	if (!isText(reason.text)) reasonErr('missing "text" (e.g. "Why is it the most suitable?")');
	if (!Array.isArray(reason.options) || reason.options.length < 2) {
		return reasonErr('"options" should be a list of at least two reasons');
	}
	if (reason.answer === undefined) return reasonErr('missing "answer"');
	const correct = checkAnswer('two_tier', reason.answer, reason.options.length, reasonErr);
	checkOptions(reason.options, correct, err, opts, false, 'reason option');
}

/** Returns the format and the exam question's marks (null if they're invalid). */
function checkExamSkill(q: Obj, err: Err): { format: string; marks: number | null } {
	const format = q.format as string;
	if (q.format !== undefined && !SKILL_FORMATS.includes(format as never)) {
		err(`format "${q.format}" should be one of: ${SKILL_FORMATS.join(', ')}`);
	}
	let marks: number | null = null;
	const eq = q.exam_question;
	if (eq !== undefined) {
		if (!isObject(eq)) {
			err('exam_question should have text and marks');
		} else {
			for (const key of Object.keys(eq)) if (key !== 'text' && key !== 'marks') err(`exam_question: unknown field "${key}"`);
			if (!isText(eq.text)) err('exam_question: missing "text"');
			if (Number.isInteger(eq.marks) && (eq.marks as number) > 0) marks = eq.marks as number;
			else err('exam_question: "marks" should be a whole number above 0');
		}
	}
	if (format === 'missing_point' && !isText(q.sample_answer)) {
		err('a missing_point question needs a sample_answer (the answer that falls short)');
	}
	if (q.sample_answer !== undefined && format !== 'missing_point') {
		err('sample_answer is only for missing_point questions; best_answer samples go in the options');
	}
	return { format, marks };
}

function checkImage(item: Obj, err: Err, opts: ValidateOptions) {
	if (item.image === undefined) {
		if (item.image_alt !== undefined) err('has image_alt but no image');
		return;
	}
	if (typeof item.image !== 'string' || !item.image.startsWith('/assets/quiz-images/')) {
		err(`image "${item.image}" should be under /assets/quiz-images/<quiz>/`);
	} else if (!opts.imageExists(item.image)) {
		err(`image ${item.image} doesn't exist (it should be at static${item.image})`);
	}
	if (!isText(item.image_alt)) err('has an image but no image_alt describing it');
}

function optionLabel(option: unknown): string {
	if (isObject(option) && isText(option.text)) {
		const text = option.text.trim();
		return text.length > 30 ? `"${text.slice(0, 30)}…"` : `"${text}"`;
	}
	return isObject(option) && typeof option.image === 'string' ? option.image : 'no text';
}

/** A validated question, with defaults filled in and nothing extra. */
function normalise(q: Obj): Question {
	const pickOption = (o: Obj) => {
		const out: Obj = {};
		for (const key of OPTION_FIELDS) if (o[key] !== undefined) out[key] = o[key];
		return out;
	};
	const type = (q.type ?? 'single') as QuestionType;
	const out: Obj = { type };
	for (const key of [...QUESTION_FIELDS, ...EXTRA_FIELDS[type]]) if (q[key] !== undefined) out[key] = q[key];
	out.options = (q.options as Obj[]).map(pickOption);
	if (type === 'two_tier') {
		const r = q.reason as Obj;
		out.reason = { text: r.text, options: (r.options as Obj[]).map(pickOption), answer: r.answer };
	}
	if (type === 'exam_skill') {
		const eq = q.exam_question as Obj;
		out.exam_question = { text: eq.text, marks: eq.marks };
	}
	return out as unknown as Question;
}
