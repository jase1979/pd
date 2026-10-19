// Unit pages (/gcse/unit2/) and topic pages (/gcse/unit2/timber/) share this
// route. A URL listed as a unit in nav.yml is a unit page; anything with a
// Markdown file under content/ is a topic page.

import { error } from '@sveltejs/kit';
import { allTopics, levels, topicPages, units } from '$lib/server/site';
import { quizIdForPage } from '$lib/server/quiz/bank';
import type { EntryGenerator, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const unit = units.find((u) => u.url === url.pathname);
	if (unit) {
		const level = levels.find((l) => l.id === unit.level);
		return { kind: 'unit' as const, unit, level };
	}

	const topic = topicPages.get(url.pathname);
	if (!topic) error(404);

	const index = allTopics.findIndex((t) => t.url === topic.url);
	return {
		kind: 'topic' as const,
		topic,
		// Whether the quiz is actually shown is decided in the browser, by asking
		// the API: it depends on ENVIRONMENT, which a prerendered page can't know.
		quizId: quizIdForPage(topic.url),
		// Only h2s go in the "On this page" list, as before.
		toc: topic.headings.filter((h) => h.depth === 2),
		prev: index > 0 ? allTopics[index - 1] : null,
		next: index >= 0 && index < allTopics.length - 1 ? allTopics[index + 1] : null
	};
};

// Tell the prerenderer about every page, not just the ones it finds by
// following links.
export const entries: EntryGenerator = () => [
	...units.map((u) => ({ path: u.url.replace(/^\/gcse\/|\/$/g, '') })),
	...[...topicPages.keys()].map((url) => ({ path: url.replace(/^\/gcse\/|\/$/g, '') }))
];
