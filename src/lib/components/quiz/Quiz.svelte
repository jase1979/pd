<script lang="ts">
	// The quiz on a topic page. Everything comes from the API at runtime:
	//   /api/quiz/:id/meta     is the quiz available here? (if not, show nothing)
	//   /api/attempts/start    the questions, without answers
	//   /api/attempts/submit   the marks and all the feedback
	// The browser never sees an answer until the attempt has been submitted.
	import { onMount, tick } from 'svelte';
	import type { PublicQuestion, QuestionResult, QuizMeta, StartResult, SubmitResult } from '$lib/quiz/public';
	import { answered, complete, emptyDraft, shuffledOrder, toChosen, type Draft } from '$lib/quiz/draft';
	import QuestionCard from './QuestionCard.svelte';
	import FeedbackItem from './FeedbackItem.svelte';
	import RetryRound from './RetryRound.svelte';

	let { id }: { id: string } = $props();

	let phase = $state<'hidden' | 'intro' | 'question' | 'feedback' | 'retry'>('hidden');
	let meta = $state<QuizMeta>();
	let token = '';
	let questions = $state<PublicQuestion[]>([]);
	/** For each question, the order its options (and reasons) are shown in, as original indexes. */
	let orders = $state<{ options: number[]; reasons: number[] }[]>([]);
	let drafts = $state<Draft[]>([]);
	let index = $state(0);
	let busy = $state(false);
	let message = $state('');
	let result = $state<SubmitResult>();
	let firstTime = $state(false);
	let heading = $state<HTMLElement>();

	const triedKey = $derived(`quiz-tried:${id}`);
	const current = $derived(questions[index]);
	const isLast = $derived(index === questions.length - 1);
	const allComplete = $derived(questions.every((q, i) => complete(q, drafts[i])));

	onMount(async () => {
		try {
			const res = await fetch(`/api/quiz/${encodeURIComponent(id)}/meta`);
			if (!res.ok) return; // no quiz rather than a broken one
			meta = await res.json();
			if (!meta?.available) return;
		} catch {
			return;
		}
		try {
			firstTime = localStorage.getItem(triedKey) === null;
		} catch {
			firstTime = true;
		}
		phase = 'intro';
	});

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

	/** Move to a new screen and put keyboard focus on its heading, so screen readers announce it. */
	async function focusHeading() {
		await tick();
		heading?.focus();
	}

	async function start() {
		busy = true;
		message = '';
		try {
			const data = await post<StartResult>('/api/attempts/start', { mode: 'topic', quiz_id: id });
			token = data.token;
			questions = data.questions;
			orders = data.questions.map((q) => ({
				options: shuffledOrder(q.options.length),
				reasons: shuffledOrder(q.reason?.options.length ?? 0)
			}));
			drafts = data.questions.map(emptyDraft);
			result = undefined;
			await show(0);
		} catch (e) {
			message = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function show(i: number) {
		index = i;
		phase = 'question';
		await focusHeading();
	}

	async function submit() {
		busy = true;
		message = '';
		try {
			result = await post<SubmitResult>('/api/attempts/submit', {
				token,
				answers: questions.map((q, i) => ({
					question_id: q.id,
					chosen: toChosen(q, drafts[i]),
					dont_know: drafts[i].dont_know,
					confidence: drafts[i].dont_know ? null : drafts[i].confidence
				}))
			});
			try {
				localStorage.setItem(triedKey, '1');
			} catch {
				// Only used for the first-attempt message; fine without it.
			}
			firstTime = false;
			phase = 'feedback';
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
	const sureWrong = $derived(items.filter(({ result: r }) => !r.correct && r.confidence === 'sure'));
	const notYet = $derived(items.filter(({ result: r }) => !r.correct && r.confidence !== 'sure'));
	const lucky = $derived(items.filter(({ result: r }) => r.correct && r.confidence === 'guess'));
	const secure = $derived(items.filter(({ result: r }) => r.correct && r.confidence === 'sure'));
	/** Wrong, "I don't know" and guessed questions: everything "Try again now" re-asks. */
	const toRetry = $derived(items.filter(({ result: r }) => !(r.correct && r.confidence === 'sure')));
</script>

{#if phase !== 'hidden' && meta}
	<section class="quiz" aria-label="Quiz: {meta.title}">
		{#if phase === 'intro'}
			<h2 class="quiz-title" tabindex="-1" bind:this={heading}>Quiz yourself</h2>
			<p class="quiz-intro">
				{meta.questions_per_attempt} questions on {meta.title}. It's low stakes: try it as many times as you like.
			</p>
			{#if firstTime}
				<p class="quiz-intro">It's fine to try this before reading the notes — having a go first helps you learn.</p>
			{/if}
			<button type="button" class="quiz-btn quiz-btn--primary" onclick={start} disabled={busy}>
				{busy ? 'Loading…' : 'Start the quiz'}
			</button>
		{:else if phase === 'question' && current}
			<div class="quiz-progress">
				<span>Question {index + 1} of {questions.length}</span>
				<progress max={questions.length} value={index + 1} aria-hidden="true"></progress>
			</div>

			<!-- Outside the per-question block, so it stays put while consecutive questions share a scenario. -->
			{#if current.scenario}
				<div class="quiz-scenario" id="quiz-{id}-scenario">
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
					name="quiz-{id}-q{index}"
					describedBy={current.scenario ? `quiz-${id}-scenario` : undefined}
				/>
			{/key}

			<div class="quiz-nav">
				{#if index > 0}
					<button type="button" class="quiz-btn" onclick={() => show(index - 1)}>← Back</button>
				{/if}
				{#if isLast}
					<button type="button" class="quiz-btn quiz-btn--primary" onclick={submit} disabled={busy || !allComplete}>
						{busy ? 'Marking…' : 'Submit answers'}
					</button>
				{:else}
					<button
						type="button"
						class="quiz-btn quiz-btn--primary"
						onclick={() => show(index + 1)}
						disabled={!complete(current, drafts[index])}
					>
						Next →
					</button>
				{/if}
			</div>
			{#if !complete(current, drafts[index])}
				<p class="quiz-hint" aria-live="polite">
					{answered(current, drafts[index])
						? 'Pick "Sure" or "Guessing" to carry on.'
						: current.reason && drafts[index].picks.length
							? 'Choose a reason to carry on.'
							: 'Choose an answer to carry on.'}
				</p>
			{:else if isLast && !allComplete}
				<p class="quiz-hint" aria-live="polite">Some earlier questions aren't finished yet. Use Back to find them.</p>
			{/if}
		{:else if phase === 'feedback' && result}
			<h2 class="quiz-title" tabindex="-1" bind:this={heading}>
				You scored {result.score} out of {result.max_score}
			</h2>
			{#if toRetry.length}
				<div class="quiz-nav quiz-nav--top">
					<button type="button" class="quiz-btn quiz-btn--primary" onclick={() => (phase = 'retry')}>
						Try the ones you got wrong again now
					</button>
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
			{#if lucky.length}
				<div class="quiz-fb-group">
					<h3>Lucky guesses</h3>
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
				<button type="button" class="quiz-btn" onclick={start} disabled={busy}>
					{busy ? 'Loading…' : 'Try a new set of questions'}
				</button>
			</div>
		{:else if phase === 'retry' && result}
			<RetryRound items={toRetry} name="quiz-{id}" onDone={backToResults} />
		{/if}

		{#if message}
			<p class="quiz-error" role="alert">{message}</p>
		{/if}
	</section>
{/if}
