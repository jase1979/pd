// The unit and topic pages under /gcse/ and /gcse-2026/. A URL listed as a
// unit in nav.yml is a unit page (with optional intro text); anything with a
// Markdown file under content/ is a topic page.

import { error } from '@sveltejs/kit';
import { levels, levelTopics, topicPages, unitIntros, units } from './site';
import { quizIdForPage } from './quiz/bank';

export function loadUnitOrTopic(pathname: string) {
	const unit = units.find((u) => u.url === pathname);
	if (unit) {
		const level = levels.find((l) => l.id === unit.level);
		return { kind: 'unit' as const, unit, level, intro: unitIntros.get(unit.url) ?? null };
	}

	const topic = topicPages.get(pathname);
	if (!topic) error(404);

	const siblings = levelTopics(topic.url);
	const index = siblings.findIndex((t) => t.url === topic.url);
	return {
		kind: 'topic' as const,
		topic,
		// Only h2s go in the "On this page" list, as before.
		toc: topic.headings.filter((h) => h.depth === 2),
		prev: index > 0 ? siblings[index - 1] : null,
		next: index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null,
		// Whether the quiz is actually shown is decided in the browser, by asking
		// the API: it depends on ENVIRONMENT, which a prerendered page can't know.
		quizId: quizIdForPage(topic.url)
	};
}

/** Every unit and topic page under /<prefix>/, for the prerenderer. */
export function entriesUnder(prefix: string) {
	const start = `/${prefix}/`;
	const urls = new Set([...units.map((u) => u.url), ...topicPages.keys()].filter((u) => u.startsWith(start) && u !== start));
	return [...urls].map((url) => ({ path: url.slice(start.length).replace(/\/$/, '') }));
}
export type UnitOrTopic = ReturnType<typeof loadUnitOrTopic>;
