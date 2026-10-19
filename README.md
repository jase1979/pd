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
src/lib/server/quiz/          quiz validation, warnings, question selection and
                              tokens; the answers never leave the server
src/lib/quiz/                 marking and the API's data shapes, shared with the
                              browser (no answers in here)
src/lib/components/quiz/      the quiz screens
src/lib/server/config.ts      every quiz threshold and tunable number
src/routes/api/               the API: quizzes, attempts, student login,
                              progress and page tracking
src/lib/server/students.ts    login codes, sessions and the login rate limit
src/lib/server/progress.ts    every progress figure (mastery, statuses,
                              mistakes, pace, calibration)
src/lib/server/quiz/modes.ts  which questions each practice mode serves
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
- Question types: `single` (the default), `multi` ("Select TWO"), `two_tier`
  (answer, then reason) and `exam_skill` (`best_answer`, `missing_point` or
  `command_word`). `legacy-u2-timber.yml` has an example of each, plus
  scenarios, a calculation with `working`, an image question and
  `past_papers` links.
- A question that describes its own product context, rather than using a
  shared scenario, can say `context: true`, so it counts towards the target
  of half the questions being in context.
- The build also prints **warnings** (fewer than 20 reviewed questions, a
  missing `see` link, a long explanation, ...) without failing, and writes
  `quiz-report.md` at the repo root with counts for each quiz. Git ignores it.
- After the build, `scripts/check-quiz-links.mjs` checks that every `see` and
  `past_papers` link points at a real page and `#anchor`, and warns if not.
- Tunable numbers (minimum quiz size, warning targets, token lifetime) are in
  `src/lib/server/config.ts`.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # ENVIRONMENT=dev and a local signing secret
npm run migrate:local            # create the local D1 database
npm run dev                      # http://localhost:5173, reloads as you edit
```

`npm run dev` and `wrangler pages dev` both read `wrangler.toml` and
`.dev.vars`, and use a local D1 database under `.wrangler/`.

To try student logins before the teacher pages exist:

```bash
npm run seed:dev     # creates "Test group (dev)" locally and prints 5 login codes
```

Running it again replaces the test group and everything its students did.

## Teachers

- Teachers sign in at `/teacher/login/` with a link emailed to them, if their
  address is in the `TEACHER_EMAILS` secret. Opening the link only shows a
  "Sign in" button, so mail scanners can't use it up.
- Locally, with no `RESEND_API_KEY`, the link is printed in the terminal and
  shown on screen. `DEV_TEACHER_EMAIL` in `.dev.vars` skips signing in
  altogether; it only works when `ENVIRONMENT=dev`.
- `/teacher/` lists the teacher's groups, with a reminder to delete any that
  are archived or more than a year old. `/teacher/group/?id=` adds students
  from a pasted list (preview, then confirm), shows and resets codes, moves and
  removes students, and deletes the group (type its name to confirm).
  `/teacher/group/print/?id=` prints login slips, 10 to an A4 page.

## Students and practice

- Students log in at `/login/` with only their code. The session ends when the
  browser closes (12 hours at most), or lasts 7 days with "Remember me".
- Pages: `/progress/` (the student's dashboard), `/review/` (Mixed review,
  Timed practice and Practise my mistakes) and `/exam-technique/`.
- Every page is still static. Login status in the header comes from a
  readable `pd_user` cookie holding the username only; the API checks the
  HttpOnly `pd_session` cookie for anything that matters.
- Progress figures are worked out in `src/lib/server/progress.ts` from the
  saved answers each time; there are no summary tables. All the thresholds are
  in `src/lib/server/config.ts`.

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
