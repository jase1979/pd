// Everything the pages are built from: the data files in src/lib/data and the
// Markdown notes in content/. Server-only, so none of it (or the YAML and
// Markdown parsers) ends up in the browser bundle. Pages are prerendered, so
// this all runs once at build time.

import yaml from 'js-yaml';
import { renderMarkdown, glossarySlug, type Heading } from './markdown';
import levelsYml from '$lib/data/levels.yml?raw';
import navYml from '$lib/data/nav.yml?raw';
import glossaryYml from '$lib/data/glossary.yml?raw';
import pastPapersJson from '$lib/data/past_papers.json';

export interface Level {
	id: string;
	display: string;
	tag: string;
	url: string;
	subtitle: string;
	home_desc: string;
}

export interface NavTopic {
	url: string;
	title: string;
}

export interface Unit {
	id: string;
	label: string;
	url: string;
	level: string;
	description: string;
	topics: NavTopic[];
}

export interface GlossaryEntry {
	term: string;
	definition: string;
	level: string;
	source: string;
}

export interface PastPaperPart {
	part: string;
	label: string;
	question: string;
	marks: number;
	answer: string;
}

export interface PastPaperQuestion {
	id: string;
	paper: string;
	year: number;
	session: string;
	question_number: string;
	topic: string;
	total_marks: number;
	type: string;
	images: string[];
	context: string;
	parts: PastPaperPart[];
}

export interface TopicPage {
	url: string;
	title: string;
	level: string;
	level_url: string;
	unit_name: string;
	unit_url: string;
	html: string;
	headings: Heading[];
}

export const levels = yaml.load(levelsYml) as Level[];
export const units = yaml.load(navYml) as Unit[];
export const glossary = yaml.load(glossaryYml) as GlossaryEntry[];
export const pastPapers = pastPapersJson as PastPaperQuestion[];

const glossaryDefs = new Map(glossary.map((e) => [glossarySlug(e.term), e.definition]));

/** Split a Markdown file into its YAML front matter and body. */
export function parseFrontMatter(raw: string): { data: Record<string, unknown>; body: string } {
	const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
	if (!match) return { data: {}, body: raw };
	return { data: (yaml.load(match[1]) as Record<string, unknown>) ?? {}, body: match[2] };
}

// content/gcse/unit2/timber/index.md is served at /gcse/unit2/timber/.
const files = import.meta.glob('/content/**/index.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export const topicPages = new Map<string, TopicPage>();
for (const [path, raw] of Object.entries(files)) {
	const url = path.replace(/^\/content/, '').replace(/index\.md$/, '');
	const { data, body } = parseFrontMatter(raw);
	const { html, headings } = renderMarkdown(body, glossaryDefs);
	topicPages.set(url, {
		url,
		title: String(data.title ?? ''),
		level: String(data.level ?? ''),
		level_url: String(data.level_url ?? ''),
		unit_name: String(data.unit_name ?? ''),
		unit_url: String(data.unit_url ?? ''),
		html,
		headings
	});
}

/** Every topic in nav order, for the previous / next links. */
export const allTopics: NavTopic[] = units.flatMap((u) => u.topics);
