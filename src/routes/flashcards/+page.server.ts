// Flashcard decks, one JSON file per topic in src/lib/data/flashcards/, named
// after the topic's URL: /gcse/unit1/energy/ -> gcse-unit1-energy.json.
// Built into the page at build time, like everything else here.

import { levels, units } from '$lib/server/site';

interface Card {
	id: string;
	front: string;
	back: string;
}

const files = import.meta.glob('/src/lib/data/flashcards/*.json', { eager: true, import: 'default' }) as Record<string, Card[]>;
const decks = Object.fromEntries(Object.entries(files).map(([path, cards]) => [path.split('/').pop()!.replace(/\.json$/, ''), cards]));

/** "/gcse-2026/unit1/core/energy/" -> "gcse-2026-unit1-core-energy" */
const keyOf = (url: string) => url.replace(/^\/|\/$/g, '').split('/').join('-');

export const load = () => ({
	decks,
	// Every unit with at least one deck, grouped by level in nav order.
	levels: levels
		.map((level) => ({
			id: level.id,
			display: level.display,
			units: units
				.filter((u) => u.level === level.id)
				.map((u) => ({ label: u.label, topics: u.topics.map((t) => ({ key: keyOf(t.url), label: t.title })).filter((t) => decks[t.key]?.length) }))
				.filter((u) => u.topics.length)
		}))
		.filter((l) => l.units.length)
});
