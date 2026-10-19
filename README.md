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
content/quizzes/*.yml         the quizzes, one file per topic (see below)
src/lib/server/quiz/          quiz validation, question selection, tokens and
                              marking; the answers never leave the server
src/lib/server/config.ts      every quiz threshold and tunable number
src/routes/api/               the quiz API (start, submit, meta)
migrations/                   D1 database schema
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

## Quizzes

Each topic's quiz is a YAML file in `content/quizzes/`, named after its id
(`legacy-u2-timber.yml`). Its `page` field says which topic page it appears on.
The format is described in the build spec; `legacy-u2-timber.yml` is a worked
example.

- Every question starts as `status: draft`. Drafts are served in local
  development and on preview deployments, never on the live site. Change a
  question to `status: reviewed` once you've checked it.
- A quiz is only shown if it can serve at least 5 questions with different
  concepts, so the live site shows nothing until 5 concepts are reviewed.
- The build checks every quiz file and **fails with a list of problems** if
  anything is wrong (a missing `why_wrong`, an answer out of range, a typo in a
  field name, ...). `npm run dev` shows the same list on screen.
- Question ids are permanent. Never reuse or renumber them.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # ENVIRONMENT=dev and a local signing secret
npm run migrate:local            # create the local D1 database
npm run dev                      # http://localhost:5173, reloads as you edit
```

`npm run dev` and `wrangler pages dev` both read `wrangler.toml` and
`.dev.vars`, and use a local D1 database under `.wrangler/`.

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
