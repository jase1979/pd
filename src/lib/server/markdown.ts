// Markdown → HTML for the revision notes, run at build time only.
//
// The notes were written for Jekyll's kramdown, so this reproduces the parts of
// kramdown's output the site relies on. Anything here that looks fussy is there
// so that existing URLs and anchors keep working after the move to SvelteKit:
//
//  - heading ids use the same GitHub-style slugs kramdown generated, so links
//    like /gcse/unit2/timber/#manufactured-boards still land in the right place
//  - <div class="key-term" markdown="1"> blocks have their contents rendered as
//    Markdown, as kramdown's markdown="1" attribute did
//  - straight quotes, "..." and "--" become curly quotes, ellipses and
//    dashes, as kramdown's typographer did
//
// Two things the old site did in the browser now happen here instead, so they
// work without JavaScript: wrapping tables for horizontal scrolling, and linking
// each key term to its glossary entry with a tooltip.

import { Marked, type Tokens, type TokenizerAndRendererExtension } from 'marked';

export interface Heading {
	depth: number;
	id: string;
	text: string;
}

export interface Rendered {
	html: string;
	headings: Heading[];
}

/** Glossary definitions keyed by glossarySlug(term), for key-term tooltips. */
export type GlossaryDefs = Map<string, string>;

/**
 * The id kramdown's GFM parser gives a heading: lower case, punctuation removed,
 * spaces turned into hyphens. "Papers & Boards" becomes "papers--boards" — the
 * double hyphen is what kramdown produced, so it is kept.
 */
export function headingSlug(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}_\- ]/gu, '')
		.replace(/ /g, '-');
}

/** The glossary page's anchor for a term, without the "term-" prefix. */
export function glossarySlug(term: string): string {
	return term
		.toLowerCase()
		.replace(/[()]/g, '')
		.replace(/[/\s]+/g, '-');
}

/**
 * kramdown's typographic substitutions: curly quotes, ellipses and dashes.
 * A quote after a letter, digit or closing punctuation closes (or is an
 * apostrophe); anything else opens.
 */
export function smartTypography(text: string): string {
	return text
		.replace(/\.\.\./g, '…')
		.replace(/---/g, '—')
		.replace(/--/g, '–')
		.replace(/['"]/g, (q, offset: number, whole: string) => {
			const before = offset > 0 ? whole[offset - 1] : ' ';
			const closes = /[\p{L}\p{N}.,;:!?)\]}%’”…]/u.test(before);
			if (q === "'") return closes ? '’' : '‘';
			return closes ? '”' : '“';
		});
}

function stripTags(html: string): string {
	return html
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function escapeAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * A key-term box. kramdown rendered the Markdown inside it because of the
 * markdown="1" attribute; marked would otherwise treat the whole block as raw
 * HTML and leave the **bold** untouched.
 */
function keyTermExtension(glossary: GlossaryDefs): TokenizerAndRendererExtension {
	return {
		name: 'keyTerm',
		level: 'block',
		start(src) {
			return src.match(/^<div class="key-term" markdown="1">/m)?.index;
		},
		tokenizer(src) {
			const match = /^<div class="key-term" markdown="1">\n([\s\S]*?)\n<\/div>[^\S\n]*(?:\n+|$)/.exec(src);
			if (!match) return undefined;
			return {
				type: 'keyTerm',
				raw: match[0],
				tokens: this.lexer.blockTokens(match[1].trim(), [])
			};
		},
		renderer(token) {
			const inner = this.parser.parse(token.tokens ?? []);
			// The first bold phrase is the term itself. If the glossary has it,
			// link it there with the definition as a hover tooltip.
			const linked = inner.replace(/<strong>([\s\S]*?)<\/strong>/, (whole, label: string) => {
				const slug = glossarySlug(stripTags(label).trim());
				const def = glossary.get(slug);
				if (!def) return whole;
				return `<strong><a href="/glossary/#term-${slug}" class="key-term-link" data-tooltip="${escapeAttr(def)}">${label}</a></strong>`;
			});
			return `<div class="key-term">\n${linked}</div>\n`;
		}
	};
}

/**
 * Any other <div class="..." markdown="1"> box, e.g. an exam tip: its
 * contents are rendered as Markdown, as kramdown did. (Key terms have their
 * own extension above, because of the glossary link.)
 */
const markdownBoxExtension: TokenizerAndRendererExtension = {
	name: 'markdownBox',
	level: 'block',
	start(src) {
		return src.match(/^<div class="(?!key-term")[\w -]+" markdown="1">/m)?.index;
	},
	tokenizer(src) {
		const match = /^<div class="((?!key-term")[\w -]+)" markdown="1">\n([\s\S]*?)\n<\/div>[^\S\n]*(?:\n+|$)/.exec(src);
		if (!match) return undefined;
		return { type: 'markdownBox', raw: match[0], className: match[1], tokens: this.lexer.blockTokens(match[2].trim(), []) };
	},
	renderer(token) {
		return `<div class="${escapeAttr(token.className)}">\n${this.parser.parse(token.tokens ?? [])}</div>\n`;
	}
};

export function renderMarkdown(source: string, glossary: GlossaryDefs = new Map()): Rendered {
	const headings: Heading[] = [];
	const used = new Map<string, number>();

	const marked = new Marked({ gfm: true });
	marked.use({
		extensions: [keyTermExtension(glossary), markdownBoxExtension],
		walkTokens(token) {
			// Only plain text, not code or text already escaped by a backslash.
			if (token.type === 'text' && !('tokens' in token && token.tokens)) {
				token.text = smartTypography(token.text);
			}
		},
		renderer: {
			heading(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, { tokens, depth }: Tokens.Heading) {
				const inner = this.parser.parseInline(tokens);
				const text = stripTags(inner);
				// Repeated headings get -1, -2… as kramdown did.
				let id = headingSlug(text);
				const seen = used.get(id) ?? 0;
				used.set(id, seen + 1);
				if (seen > 0) id = `${id}-${seen}`;
				headings.push({ depth, id, text });
				return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
			}
		}
	});

	const html = (marked.parse(source, { async: false }) as string)
		.replace(/<table>/g, '<div class="table-wrap"><table>')
		.replace(/<\/table>/g, '</table></div>');

	return { html, headings };
}
