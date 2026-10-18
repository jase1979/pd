import { glossary } from '$lib/server/site';
import { glossarySlug, renderMarkdown } from '$lib/server/markdown';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const load = () => {
	// Case-insensitive A–Z, as Liquid's sort_natural did.
	const sorted = [...glossary].sort((a, b) => {
		const x = a.term.toLowerCase();
		const y = b.term.toLowerCase();
		return x < y ? -1 : x > y ? 1 : 0;
	});

	const sections: { letter: string; entries: { term: string; slug: string; level: string; source: string; definitionHtml: string }[] }[] = [];
	for (const entry of sorted) {
		const letter = entry.term.slice(0, 1).toUpperCase();
		if (sections.at(-1)?.letter !== letter) sections.push({ letter, entries: [] });
		sections.at(-1)!.entries.push({
			term: entry.term,
			slug: glossarySlug(entry.term),
			level: entry.level,
			source: entry.source,
			definitionHtml: renderMarkdown(entry.definition).html.replace(/<\/?p>/g, '').trim()
		});
	}

	const present = new Set(sections.map((s) => s.letter));
	return {
		letters: LETTERS.map((letter) => ({ letter, present: present.has(letter) })),
		sections
	};
};
