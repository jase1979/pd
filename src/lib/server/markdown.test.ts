import { describe, expect, it } from 'vitest';
import { glossarySlug, headingSlug, renderMarkdown, smartTypography } from './markdown';

describe('headingSlug', () => {
	// These are the ids kramdown generated, so existing links keep working.
	it('matches kramdown ids', () => {
		expect(headingSlug('Manufactured boards')).toBe('manufactured-boards');
		expect(headingSlug('Papers & Boards')).toBe('papers--boards');
		expect(headingSlug('Life Cycle Analysis (LCA)')).toBe('life-cycle-analysis-lca');
		expect(headingSlug('Why apply a surface finish?')).toBe('why-apply-a-surface-finish');
		expect(headingSlug('What to include — page by page')).toBe('what-to-include--page-by-page');
	});
});

describe('renderMarkdown', () => {
	it('gives headings ids and numbers repeats', () => {
		const { html, headings } = renderMarkdown('## Overview\n\n## Overview\n');
		expect(html).toContain('<h2 id="overview">');
		expect(html).toContain('<h2 id="overview-1">');
		expect(headings.map((h) => h.id)).toEqual(['overview', 'overview-1']);
	});

	it('renders Markdown inside key-term boxes and links the term to the glossary', () => {
		const glossary = new Map([['hardwood', 'Timber from deciduous trees.']]);
		const source = '<div class="key-term" markdown="1">\n**Hardwood** — from trees that lose their leaves.\n</div>\n\nNext paragraph.';
		const { html } = renderMarkdown(source, glossary);
		expect(html).toContain('<div class="key-term">');
		expect(html).toContain(
			'<strong><a href="/glossary/#term-hardwood" class="key-term-link" data-tooltip="Timber from deciduous trees.">Hardwood</a></strong>'
		);
		expect(html).toContain('<p>Next paragraph.</p>');
	});

	it('leaves a key term unlinked when the glossary has no entry for it', () => {
		const source = '<div class="key-term" markdown="1">\n**Alloy** — a mixture of metals.\n</div>\n';
		expect(renderMarkdown(source).html).toContain('<strong>Alloy</strong>');
	});

	it('wraps tables so they scroll on small screens', () => {
		const { html } = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |\n');
		expect(html).toMatch(/^<div class="table-wrap"><table>[\s\S]*<\/table><\/div>/);
	});

	it('uses curly quotes like kramdown', () => {
		expect(renderMarkdown("Small 'chips' of timber, it's \"strong\"").html).toContain(
			'Small ‘chips’ of timber, it’s “strong”'
		);
	});
});

describe('smartTypography', () => {
	it('converts ellipses and dashes', () => {
		expect(smartTypography('Design... a--b c---d')).toBe('Design… a–b c—d');
	});
});

describe('glossarySlug', () => {
	it('matches the glossary page ids', () => {
		expect(glossarySlug('Life Cycle Assessment (LCA)')).toBe('life-cycle-assessment-lca');
		expect(glossarySlug('Input/Output')).toBe('input-output');
	});
});
