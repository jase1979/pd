<script lang="ts">
	// Runs one attempt in any mode: starts it, shows one question per screen,
	// submits, then shows the feedback and "Try the ones you got wrong again
	// now". The page around it (topic page, /review/, /exam-technique/) shows
	// the intro and decides what to start.
	//
	// Timed practice adds a countdown that can't be paused. At zero the
	// attempt submits itself, and anything unanswered is "not reached".
	import { onDestroy, onMount, tick } from 'svelte';
	import type { Mode, PublicQuestion, QuestionResult, StartResult, SubmitResult } from '$lib/quiz/public';
	import { answered, complete, emptyDraft, shuffledOrder, toChosen, type Draft } from '$lib/quiz/draft';
	import { logOut } from '$lib/session.svelte';
	import QuestionCard from './QuestionCard.svelte';
	import FeedbackItem from './FeedbackItem.svelte';
	import RetryRound from './RetryRound.svelte';

	let {
		request,
		name,
		onExit,
		onSubmitted
	}: {
		request: { mode: Mode; quiz_id?: string; topics?: string[]; assignment_id?: number };
		/** Unique on the page, for element ids. */
		name: string;
		/** Leave the quiz (e.g. back to the intro). */
		onExit?: () => void;
		onSubmitted?: (result: SubmitResult) => void;
	} = $props();

	let phase = $state<'loading' | 'question' | 'feedback' | 'retry' | 'error'>('loading');
	let attempt = $state<StartResult>();
	let questions = $state<PublicQuestion[]>([]);
	let orders = $state<{ options: number[]; reasons: number[] }[]>([]);
	let drafts = $state<Draft[]>([]);
	let index = $state(0);
	let busy = $state(false);
	let message = $state('');
	let result = $state<SubmitResult>();
	let heading = $state<HTMLElement>();

	// Timed practice
	const timed = $derived(request.mode === 'timed');
	let deadline = 0;
	let remaining = $state(0);
	let timer: ReturnType<typeof setInterval> | undefined;
	let warned = $state(false);

	const current = $derived(questions[index]);
	const isLast = $derived(index === questions.length - 1);
	/** Timed practice: confidence is optional and questions can be skipped. */
	const ready = (i: number) => (timed ? true : complete(questions[i], drafts[i]));
	const allReady = $derived(questions.every((_, i) => ready(i)));

	onMount(() => {
		start();
	});
	onDestroy(() => clearInterval(timer));

	async function post<T>(url: string, body: unknown): Promise<T> {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = (await res.json().catch(() => ({}))) as { message?: string };
		if (!res.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
		return data as T;
	}

	async function focusHeading() {
		await tick();
		heading?.focus();
	}

	async function start() {
		phase = 'loading';
		message = '';
		result = undefined;
		clearInterval(timer);
		try {
			const data = await post<StartResult>('/api/attempts/start', request);
			attempt = data;
			questions = data.questions;
			orders = data.questions.map((q) => ({
				options: shuffledOrder(q.options.length),
				reasons: shuffledOrder(q.reason?.options.length ?? 0)
			}));
			drafts = data.questions.map(emptyDraft);
			if (data.time_limit_s) startTimer(data.time_limit_s);
			await show(0);
		} catch (e) {
			message = (e as Error).message;
			phase = 'error';
		}
	}

	function startTimer(seconds: number) {
		deadline = Date.now() + seconds * 1000;
		remaining = seconds;
		warned = false;
		timer = setInterval(() => {
			remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
			if (remaining <= 60) warned = true;
			if (remaining === 0) {
				clearInterval(timer);
				submit();
			}
		}, 250);
	}

	const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

	async function show(i: number) {
		index = i;
		phase = 'question';
		await focusHeading();
	}

	async function submit() {
		if (busy || phase !== 'question') return;
		busy = true;
		message = '';
		clearInterval(timer);
		try {
			result = await post<SubmitResult>('/api/attempts/submit', {
				...(attempt?.attempt_id !== undefined ? { attempt_id: attempt.attempt_id } : { token: attempt?.token }),
				answers: questions.map((q, i) => {
					const d = drafts[i];
					if (timed && !answered(q, d)) return { question_id: q.id, not_reached: true };
					return {
						question_id: q.id,
						chosen: toChosen(q, d),
						dont_know: d.dont_know,
						confidence: d.dont_know ? null : d.confidence
					};
				})
			});
			phase = 'feedback';
			onSubmitted?.(result);
			await focusHeading();
		} catch (e) {
			message = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function backToResults() {
		phase = 'feedback';
		await focusHeading();
	}

	// Feedback, grouped as in the spec. Each entry pairs a result with its question.
	type Item = { result: QuestionResult; question: PublicQuestion; number: number };
	const items = $derived<Item[]>(
		result
			? result.results.map((r, i) => ({ result: r, question: questions.find((q) => q.id === r.question_id)!, number: i + 1 }))
			: []
	);
	const notReached = $derived(items.filter(({ result: r }) => r.not_reached));
	const sureWrong = $derived(items.filter(({ result: r }) => !r.correct && r.confidence === 'sure'));
	const notYet = $derived(items.filter(({ result: r }) => !r.correct && !r.not_reached && r.confidence !== 'sure'));
	const lucky = $derived(items.filter(({ result: r }) => r.correct && r.confidence !== 'sure'));
	const secure = $derived(items.filter(({ result: r }) => r.correct && r.confidence === 'sure'));
	/** Wrong, "I don't know", guessed and not-reached questions: everything "Try again now" re-asks. */
	const toRetry = $derived(items.filter(({ result: r }) => !(r.correct && r.confidence === 'sure')));
</script>

{#snippet savingAs()}
	{#if attempt?.saving_as}
		<p class="quiz-saving">
			{result?.saved ? 'Saved as' : 'Saving as'} <strong>{attempt.saving_as}</strong>.
			<button type="button" class="quiz-link-btn" onclick={logOut}>Not you? Log out</button>
		</p>
	{/if}
{/snippet}

{#if phase === 'loading'}
	<p class="quiz-intro" aria-live="polite">Loading the questions…</p>
{:else if phase === 'error'}
	<p class="quiz-error" role="alert">{message}</p>
	<div class="quiz-nav">
		{#if onExit}<button type="button" class="quiz-btn" onclick={onExit}>← Back</button>{/if}
	</div>
{:else if phase === 'question' && current}
	{#if timed}
		<div class="quiz-timer" class:quiz-timer--low={warned} role="timer" aria-label="Time left">
			<span class="quiz-exam-label">Time left</span>
			<span class="quiz-timer-clock">{clock(remaining)}</span>
		</div>
		{#if warned}<p class="visually-hidden" aria-live="polite">One minute left.</p>{/if}
	{/if}
	<div class="quiz-progress">
		<span>Question {index + 1} of {questions.length}</span>
		<progress max={questions.length} value={index + 1} aria-hidden="true"></progress>
	</div>

	<!-- Outside the per-question block, so it stays put while consecutive questions share a scenario. -->
	{#if current.scenario}
		<div class="quiz-scenario" id="{name}-scenario">
			<p class="quiz-exam-label">Scenario</p>
			{#if current.scenario.image}
				<img src={current.scenario.image} alt={current.scenario.image_alt} />
			{/if}
			<p>{current.scenario.text}</p>
		</div>
	{/if}

	{#key index}
		<QuestionCard
			question={current}
			order={orders[index]}
			bind:draft={drafts[index]}
			bind:heading
			name="{name}-q{index}"
			describedBy={current.scenario ? `${name}-scenario` : undefined}
		/>
	{/key}
	{#if timed}<p class="quiz-hint">In timed practice, rating your confidence is optional.</p>{/if}

	<div class="quiz-nav">
		{#if index > 0}
			<button type="button" class="quiz-btn" onclick={() => show(index - 1)}>← Back</button>
		{/if}
		{#if !isLast}
			<button type="button" class="quiz-btn quiz-btn--primary" onclick={() => show(index + 1)} disabled={!ready(index)}>
				{timed && !answered(current, drafts[index]) ? 'Skip →' : 'Next →'}
			</button>
		{/if}
		{#if isLast || timed}
			<button
				type="button"
				class="quiz-btn"
				class:quiz-btn--primary={isLast}
				onclick={submit}
				disabled={busy || (!timed && !allReady)}
			>
				{busy ? 'Marking…' : 'Submit answers'}
			</button>
		{/if}
	</div>
	{#if !ready(index)}
		<p class="quiz-hint" aria-live="polite">
			{answered(current, drafts[index])
				? 'Pick "Sure" or "Guessing" to carry on.'
				: current.reason && drafts[index].picks.length
					? 'Choose a reason to carry on.'
					: 'Choose an answer to carry on.'}
		</p>
	{:else if isLast && !allReady}
		<p class="quiz-hint" aria-live="polite">Some earlier questions aren't finished yet. Use Back to find them.</p>
	{/if}
	{#if message}<p class="quiz-error" role="alert">{message}</p>{/if}
{:else if phase === 'feedback' && result}
	<h2 class="quiz-title" tabindex="-1" bind:this={heading}>
		You scored {result.score} out of {result.max_score}
	</h2>
	{@render savingAs()}
	{#if result.assessment}
		<p class="quiz-notice">This was an assessment, so there's only one go. Your teacher can see how you got on.</p>
	{:else if toRetry.length}
		<div class="quiz-nav quiz-nav--top">
			<button type="button" class="quiz-btn quiz-btn--primary" onclick={() => (phase = 'retry')}>
				Try the ones you got wrong again now
			</button>
		</div>
	{/if}

	{#if result.pace}
		{@const p = result.pace}
		<div class="quiz-fb-group quiz-pace">
			<h3>Your pace</h3>
			<p>
				You answered <strong>{p.reached} of {p.total}</strong> questions in {clock(Math.min(p.time_taken_s, p.time_limit_s))}
				(the limit was {clock(p.time_limit_s)}).
			</p>
			{#if p.seconds_per_question !== null && p.target_seconds_per_question !== null}
				<p>
					That's about <strong>{Math.round(p.seconds_per_question)} seconds</strong> per question; the target is
					{Math.round(p.target_seconds_per_question)}.
					{p.seconds_per_question <= p.target_seconds_per_question ? 'Good pace.' : 'Try to speed up a little.'}
				</p>
			{/if}
			{#if p.overtime}
				<p class="quiz-hint">This one was submitted well after time ran out, so it isn't counted in your pace figures.</p>
			{/if}
		</div>
	{/if}

	{#if sureWrong.length}
		<div class="quiz-fb-group quiz-fb-group--alert">
			<h3>Check these carefully — you were sure but these were wrong</h3>
			{#each sureWrong as item (item.result.question_id)}<FeedbackItem {...item} />{/each}
		</div>
	{/if}
	{#if notYet.length}
		<div class="quiz-fb-group">
			<h3>Not right yet</h3>
			{#each notYet as item (item.result.question_id)}<FeedbackItem {...item} />{/each}
		</div>
	{/if}
	{#if notReached.length}
		<div class="quiz-fb-group">
			<h3>Not reached</h3>
			<p class="quiz-hint">Time ran out before these. They aren't counted against your topic progress.</p>
			{#each notReached as item (item.result.question_id)}<FeedbackItem {...item} />{/each}
		</div>
	{/if}
	{#if lucky.length}
		<div class="quiz-fb-group">
			<h3>{timed ? 'Right, but check you know why' : 'Lucky guesses'}</h3>
			<p class="quiz-hint">You got these right, but make sure you know why.</p>
			{#each lucky as item (item.result.question_id)}<FeedbackItem {...item} />{/each}
		</div>
	{/if}
	{#if secure.length}
		<details class="quiz-fb-group quiz-fb-group--correct">
			<summary>
				<span class="quiz-mark" aria-hidden="true">✓</span>
				{secure.length} correct and sure — show them
			</summary>
			{#each secure as item (item.result.question_id)}<FeedbackItem {...item} />{/each}
		</details>
	{/if}

	{#if result.past_papers.length}
		<div class="quiz-fb-group">
			<h3>Try an exam question</h3>
			<ul class="quiz-past-papers">
				{#each result.past_papers as link (link.url)}
					<li><a href={link.url}>{link.title} →</a></li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="quiz-nav">
		{#if !result.assessment}<button type="button" class="quiz-btn" onclick={start}>Try a new set of questions</button>{/if}
		{#if onExit}<button type="button" class="quiz-btn" onclick={onExit}>Done</button>{/if}
	</div>
{:else if phase === 'retry' && result}
	<RetryRound items={toRetry} {name} onDone={backToResults} />
{/if}
