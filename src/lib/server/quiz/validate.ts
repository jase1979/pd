// Checks the quiz YAML files and turns them into a QuizBank. Any error fails
// the build (see vite-plugin.ts), with a message naming the file and question.
//
// Pure: it doesn't touch the file system itself. The caller says which images
// and pages exist, so the tests can run without real files.

import {
	QUESTION_TYPES,
	SINGLE_COMMANDS,
	SPECS,
	STATUSES,
	type Option,
	type Question,
	type Quiz
} from './types';

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

const QUIZ_FIELDS = ['id', 'spec', 'unit', 'topic', 'page', 'questions_per_attempt', 'questions'];
const QUESTION_FIELDS = [
	'id', 'type', 'status', 'spec_point', 'concept', 'command', 'see',
	'text', 'image', 'image_alt', 'options', 'answer', 'explanation'
];
const OPTION_FIELDS = ['text', 'image', 'image_alt', 'why_wrong'];

// Quiz and question ids appear in URLs and the database, so keep them simple.
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

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
		const err = (msg: string) => fileErrors.push(`${file.path}: ${msg}`);
		const quiz = file.data;

		if (!isObject(quiz)) {
			err('the file should be a quiz (id, spec, topic, questions, ...), not a list or plain text');
			errors.push(...fileErrors);
			continue;
		}

		for (const key of Object.keys(quiz)) {
			if (!QUIZ_FIELDS.includes(key)) err(`unknown field "${key}"`);
		}
		for (const key of QUIZ_FIELDS) {
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
			err(`questions_per_attempt should be a whole number above 0`);
		}

		const questions: Question[] = [];
		if (quiz.questions !== undefined) {
			if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
				err('"questions" should be a list with at least one question');
			} else {
				quiz.questions.forEach((q, i) => {
					const where = isObject(q) && isText(q.id) ? `question ${q.id}` : `question ${i + 1}`;
					const before = fileErrors.length;
					checkQuestion(q, (msg) => err(`${where}: ${msg}`), opts);
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
				// A bare "#anchor" is on the quiz's own page.
				questions: questions.map((q) => (q.see?.startsWith('#') ? { ...q, see: page + q.see } : q))
			});
		}
		errors.push(...fileErrors);
	}

	return { quizzes, errors };
}

function checkQuestion(q: unknown, err: (msg: string) => void, opts: ValidateOptions) {
	if (!isObject(q)) {
		err('should be a set of fields (id, text, options, ...), not plain text');
		return;
	}

	for (const key of Object.keys(q)) {
		if (!QUESTION_FIELDS.includes(key)) err(`unknown field "${key}"`);
	}
	// `type` defaults to single, and `see` and images are optional.
	for (const key of ['id', 'status', 'spec_point', 'concept', 'command', 'text', 'options', 'answer', 'explanation']) {
		if (q[key] === undefined || q[key] === null) err(`missing required field "${key}"`);
	}

	if (q.id !== undefined && (typeof q.id !== 'string' || !ID_PATTERN.test(q.id))) {
		err(`id "${q.id}" should be lower-case words joined by dashes, e.g. timber-001`);
	}
	const type = q.type ?? 'single';
	if (!QUESTION_TYPES.includes(type as never)) {
		err(`unknown type "${type}" (only "single" is supported so far)`);
		return; // the rest of the checks depend on the type
	}
	if (q.status !== undefined && !STATUSES.includes(q.status as never)) {
		err(`status "${q.status}" should be one of: ${STATUSES.join(', ')}`);
	}
	for (const key of ['spec_point', 'concept', 'text', 'explanation']) {
		if (q[key] !== undefined && !isText(q[key])) err(`"${key}" should be text`);
	}
	if (q.command !== undefined && !SINGLE_COMMANDS.includes(q.command as never)) {
		err(`command "${q.command}" isn't allowed for a ${type} question (use one of: ${SINGLE_COMMANDS.join(', ')})`);
	}
	if (q.see !== undefined && !(typeof q.see === 'string' && /^(#|\/)\S+$/.test(q.see))) {
		err(`see "${q.see}" should be a heading anchor like "#hardwoods" or a path like "/gcse/unit2/timber/#hardwoods"`);
	}
	checkImage(q, err, opts);

	if (q.options === undefined) return;
	if (!Array.isArray(q.options) || q.options.length < 2) {
		err('"options" should be a list of at least two options');
		return;
	}

	const answer = q.answer;
	const answerValid = Number.isInteger(answer) && (answer as number) >= 0 && (answer as number) < q.options.length;
	if (answer !== undefined && !answerValid) {
		err(
			Array.isArray(answer)
				? `answer should be a single number for a ${type} question, not a list`
				: `answer ${JSON.stringify(answer)} should be the number of an option, from 0 to ${q.options.length - 1} (counting from 0)`
		);
	}

	q.options.forEach((option, i) => {
		const optErr = (msg: string) => err(`option ${i} (${optionLabel(option)}): ${msg}`);
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
		if (!answerValid) return;
		const correct = i === answer;
		if (correct && option.why_wrong !== undefined) {
			optErr('is the correct answer, so it shouldn\'t have a why_wrong (put that in "explanation")');
		}
		if (!correct && !isText(option.why_wrong)) {
			optErr('is incorrect, so it needs a why_wrong saying why');
		}
	});
}

function checkImage(item: Obj, err: (msg: string) => void, opts: ValidateOptions) {
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
	const pick = (o: Obj): Option => {
		const out: Option = {};
		for (const key of OPTION_FIELDS) if (o[key] !== undefined) (out as Obj)[key] = o[key];
		return out;
	};
	const out: Obj = { type: 'single' };
	for (const key of QUESTION_FIELDS) if (q[key] !== undefined) out[key] = q[key];
	out.options = (q.options as Obj[]).map(pick);
	return out as unknown as Question;
}
