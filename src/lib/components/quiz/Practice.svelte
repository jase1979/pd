<script lang="ts">
	// The practice modes that aren't tied to one topic page: Mixed review,
	// Timed practice and "Practise my mistakes" on /review/, and Exam technique
	// on /exam-technique/.
	//
	// Logged-in students can go straight in: the server draws from the topics
	// they've practised. Anonymous users tick the topics to include.
	import { onMount } from 'svelte';
	import { dueLabel, type MistakeCounts, type Mode, type QuizSummary, type StudentWork } from '$lib/quiz/public';
	import { logOut, refreshSession, session } from '$lib/session.svelte';
	import QuizRunner from './QuizRunner.svelte';

	let { modes }: { modes: Mode[] } = $props();

	const INFO: Record<string, { title: string; intro: string; button: string }> = {
		mixed: {
			title: 'Mixed review',
			intro: "Questions from several topics mixed together, as they come up in the exam. Mixing topics is harder than practising one at a time, and that's why it works.",
			button: 'Start mixed review'
		},
		timed: {
			title: 'Timed practice',
			intro: 'Up to 20 questions against the clock, at about 45 seconds a mark, to build your pace. The timer can\'t be paused, and when it runs out your answers are submitted.',
			button: 'Start the clock'
		},
		technique: {
			title: 'Exam technique',
			intro: 'Questions about answering exam questions: which answer gets full marks, what a weak answer is missing, and what each command word asks you to do.',
			button: 'Start exam technique'
		},
		mistakes: {
			title: 'Practise my mistakes',
			intro: 'The questions you most recently got wrong, guessed or said "I don\'t know" to. A question leaves this list once you get it right, and sure, on a later day.',
			button: 'Practise my mistakes'
		}
	};

	// The first mode is only the starting choice; the tabs change it after that.
	// svelte-ignore state_referenced_locally
	let mode = $state<Mode>(modes[0]);
	let quizFilter = $state<string | null>(null);
	let quizzes = $state<QuizSummary[]>([]);
	let chosen = $state<string[]>([]);
	/** Logged in: draw from practised topics (true) or from the ticked ones. */
	let usePractised = $state(true);
	let mistakeCount = $state<number | null>(null);
	let running = $state(false);
	/** /review/?assignment=ID: a piece of set work. */
	let work = $state<StudentWork | null>(null);
	let workMissing = $state(false);
	let runKey = $state(0);
	let heading = $state<HTMLElement>();

	const choosable = $derived(quizzes.filter((q) => (mode === 'technique' ? q.exam_skills > 0 : q.available)));
	const needsTopics = $derived(mode !== 'mistakes' && (!session.username || !usePractised));
	const request = $derived(work ? { mode, assignment_id: work.id } : {
		mode,
		...(mode === 'mistakes' && quizFilter && { quiz_id: quizFilter }),
		...(needsTopics && { topics: chosen })
	});

	onMount(async () => {
		refreshSession();
		// Query strings, not dynamic routes: /review/?mode=timed, /review/?mode=mistakes&quiz=...
		const params = new URLSearchParams(location.search);
		const wanted = params.get('mode') as Mode | null;
		if (wanted && modes.includes(wanted)) mode = wanted;
		quizFilter = params.get('quiz');
		const workId = Number(params.get('assignment'));
		if (workId && session.username) {
			const res = await fetch('/api/student/assignments').catch(() => null);
			const list: StudentWork[] = res?.ok ? ((await res.json()) as { assignments: StudentWork[] }).assignments : [];
			work = list.find((a) => a.id === workId) ?? null;
			workMissing = !work;
		} else if (workId) {
			workMissing = true;
		}
		const [list, counts] = await Promise.all([
			fetch('/api/quizzes').then((r): Promise<QuizSummary[]> => (r.ok ? r.json() : Promise.resolve([]))).catch(() => []),
			session.username
				? fetch('/api/student/mistakes').then((r): Promise<MistakeCounts | null> => (r.ok ? r.json() : Promise.resolve(null))).catch(() => null)
				: null
		]);
		quizzes = list;
		if (counts) {
			mistakeCount = quizFilter ? (counts.by_quiz.find((m) => m.quiz_id === quizFilter)?.count ?? 0) : counts.total;
		}
	});

	function choose(m: Mode) {
		mode = m;
		const url = new URL(location.href);
		url.searchParams.set('mode', m);
		url.searchParams.delete('quiz');
		quizFilter = null;
		history.replaceState(history.state, '', url);
	}

	function start() {
		runKey++;
		running = true;
	}

	function exit() {
		running = false;
		queueMicrotask(() => heading?.focus());
	}

	const titleFor = (id: string | null) => quizzes.find((q) => q.id === id)?.title;
</script>

{#if work || workMissing}
	<section class="quiz" aria-label="Set work">
		{#if running && work}
			{#key runKey}
				<QuizRunner {request} name="work" onExit={() => location.assign('/progress/')} />
			{/key}
		{:else if work}
			<h2 class="quiz-title" tabindex="-1">{work.title}</h2>
			<p class="quiz-intro">Set by your teacher · due {dueLabel(work.due_date)} · <span class="status-badge work-{work.status}">{work.label}</span></p>
			<p class="quiz-saving">
				Saving as <strong>{session.username}</strong>.
				<button type="button" class="quiz-link-btn" onclick={logOut}>Not you? Log out</button>
			</p>
			{#if work.assessment}
				<p class="quiz-notice">
					This is an assessment: you get <strong>one go</strong>. You'll see your feedback at the end, but you can't try it again.
					If you leave part-way through, you'll come back to the same questions.
				</p>
			{/if}
			{#if work.can_start}
				<div class="quiz-nav">
					<button type="button" class="quiz-btn quiz-btn--primary" onclick={start}>{work.status === 'done' || work.status === 'late' ? 'Do it again' : 'Start'}</button>
					<a class="quiz-btn" href="/progress/">Back</a>
				</div>
			{:else}
				<p class="account-intro">You've done this one{work.best !== null ? `: you scored ${Math.round(work.best * 100)}%` : ''}. <a href="/progress/">Back to your progress</a></p>
			{/if}
		{:else}
			<h2 class="quiz-title">Set work</h2>
			<p class="quiz-notice">
				{session.username ? "That work wasn't found. It may have been removed: ask your teacher." : 'Log in to do the work your teacher has set.'}
			</p>
			<a class="quiz-btn quiz-btn--primary" href={session.username ? '/progress/' : `/login/?next=${encodeURIComponent('/review/' + location.search)}`}>
				{session.username ? 'Back to your progress' : 'Log in'}
			</a>
		{/if}
	</section>
{:else}
{#if modes.length > 1 && !running}
	<div class="practice-tabs" role="group" aria-label="Practice mode">
		{#each modes as m (m)}
			<button type="button" class="practice-tab" class:active={mode === m} aria-pressed={mode === m} onclick={() => choose(m)}>
				{INFO[m].title}
			</button>
		{/each}
	</div>
{/if}

<section class="quiz" aria-label={INFO[mode].title}>
	{#if running}
		{#key runKey}
			<QuizRunner {request} name="practice" onExit={exit} />
		{/key}
	{:else}
		<h2 class="quiz-title" tabindex="-1" bind:this={heading}>
			{INFO[mode].title}{#if mode === 'mistakes' && quizFilter && titleFor(quizFilter)}: {titleFor(quizFilter)}{/if}
		</h2>
		<p class="quiz-intro">{INFO[mode].intro}</p>

		{#if session.username}
			<p class="quiz-saving">
				Saving as <strong>{session.username}</strong>.
				<button type="button" class="quiz-link-btn" onclick={logOut}>Not you? Log out</button>
			</p>
		{:else if mode === 'mistakes'}
			<p class="quiz-notice"><a href="/login/">Log in</a> to practise your mistakes: they're kept from your saved quizzes.</p>
		{:else}
			<p class="quiz-hint">Your answers are marked but not saved. <a href="/login/">Log in</a> to keep track of your progress.</p>
		{/if}

		{#if mode === 'mistakes'}
			{#if session.username}
				{#if mistakeCount === 0}
					<p class="quiz-notice">No mistakes waiting right now. Nice work! Try a mixed review instead.</p>
				{:else}
					<div class="quiz-nav">
						<button type="button" class="quiz-btn quiz-btn--primary" onclick={start} disabled={mistakeCount === null}>
							{INFO.mistakes.button}{mistakeCount ? ` (${mistakeCount})` : ''}
						</button>
						{#if quizFilter}<a class="quiz-btn" href="/review/?mode=mistakes">All topics</a>{/if}
					</div>
				{/if}
			{/if}
		{:else}
			{#if session.username}
				<fieldset class="practice-source">
					<legend class="visually-hidden">Which topics?</legend>
					<label class="quiz-chip" class:selected={usePractised}>
						<input type="radio" name="practice-source" checked={usePractised} onchange={() => (usePractised = true)} />
						Topics I've practised
					</label>
					<label class="quiz-chip" class:selected={!usePractised}>
						<input type="radio" name="practice-source" checked={!usePractised} onchange={() => (usePractised = false)} />
						Choose topics
					</label>
				</fieldset>
			{/if}

			{#if needsTopics}
				<fieldset class="practice-topics">
					<legend>Choose the topics to include</legend>
					{#if choosable.length === 0}
						<p class="quiz-hint">
							{mode === 'technique' ? 'No topics have exam technique questions yet.' : 'No topics have quizzes yet.'}
						</p>
					{/if}
					{#each choosable as q (q.id)}
						<label class="quiz-option" class:selected={chosen.includes(q.id)}>
							<input
								type="checkbox"
								checked={chosen.includes(q.id)}
								onchange={() => (chosen = chosen.includes(q.id) ? chosen.filter((c) => c !== q.id) : [...chosen, q.id])}
							/>
							<span>{q.title} <span class="quiz-hint">({q.unit})</span></span>
						</label>
					{/each}
				</fieldset>
			{/if}

			<div class="quiz-nav">
				<button type="button" class="quiz-btn quiz-btn--primary" onclick={start} disabled={needsTopics && chosen.length === 0}>
					{INFO[mode].button}
				</button>
			</div>
		{/if}
	{/if}
</section>
{/if}
