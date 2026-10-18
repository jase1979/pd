# WJEC Product Design Revision

GCSE Product Design revision notes, past paper questions and a glossary, live at
https://pd-20x.pages.dev.

Built with **SvelteKit** (Svelte 5, TypeScript) on **Cloudflare Pages**, using
`@sveltejs/adapter-cloudflare`. Every page is prerendered to static HTML at build
time.

## Project layout

```
content/gcse/**/index.md      the revision notes, one Markdown file per topic;
                              content/gcse/unit2/timber/index.md is served at
                              /gcse/unit2/timber/
src/lib/data/                 nav.yml (units and topic order), levels.yml,
                              glossary.yml, past_papers.json
src/lib/styles/               the site's SCSS, one partial per section
src/lib/server/markdown.ts    Markdown → HTML for the notes (heading ids,
                              key-term boxes, glossary tooltips)
src/lib/server/site.ts        loads the data files and notes at build time
src/routes/                   the pages: home, /gcse/, units and topics
                              (gcse/[...path]), /glossary/, /past-papers/
static/assets/                images and past paper PDFs, served as-is
scripts/                      the past paper extraction script (not published)
```

### Editing notes

Each topic is a Markdown file with front matter:

```markdown
---
title: "Natural & Manufactured Timber"
level: "GCSE"
level_url: "/gcse/"
unit_name: "2.1.2 In-depth Knowledge: Product Design"
unit_url: "/gcse/unit2/"
---

## Hardwoods

<div class="key-term" markdown="1">
**Hardwood** — timber from deciduous trees…
</div>
```

- Each `##` heading gets an id (`#hardwoods`) and appears in "On this page".
- In a key-term box, the first **bold** phrase is linked to its glossary entry,
  with a hover tooltip, if `glossary.yml` has that term.
- A new topic also needs an entry in `src/lib/data/nav.yml`, which sets the order
  and the previous / next links.

The build fails if any page links to a page or `#anchor` that doesn't exist.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173, reloads as you edit
```

To run the production build the way Cloudflare serves it:

```bash
npm run build
npx wrangler pages dev .svelte-kit/cloudflare
```

## Tests and checks

```bash
npm test           # vitest
npm run check      # svelte-check / TypeScript
```

## Deploy (Cloudflare Pages, Git integration)

- Build command: `npm run build`
- Build output directory: `.svelte-kit/cloudflare`

Pushing to `main` deploys to production; other branches get preview URLs.
