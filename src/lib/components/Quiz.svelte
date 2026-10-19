<script lang="ts">
	// The quiz on a topic page. Everything comes from the API at runtime:
	//   /api/quiz/:id/meta     is the quiz available here? (if not, show nothing)
	//   /api/attempts/start    the questions, without answers
	//   /api/attempts/submit   the marks and all the feedback
	// The browser never sees an answer until the attempt has been submitted.
	import { onMount, tick } from 'svelte';
	import type { PublicQuestion } from '$lib/server/quiz/types';
	import type { QuestionResult, QuizMeta, StartResult, SubmitResult } from '$lib/server/quiz/attempts';

	let { id }: { id: string } = $props();

	interface Answer {
		/** Original option index, or null for "I don't know". */
		chosen: number | null;
		dont_know: boolean;
		confidence: 'sure' | 'guess' | null;
	}

	let phase = $state<'hidden' | 'intro' | 'question' | 'feedback'>('hidden');
	let meta = $state<QuizMeta>();
	let token = '';
	let questions = $state<PublicQuestion[]>([]);
	/** For each question, the order its options are shown in (original indexes). */
	let order = $state<number[][]>([]);
	let answers = $state<Answer[]>([]);
	let index = $state(0);
	let busy = $state(false);
	let message = $state('');
	let result = $state<SubmitResult>();
	let firstTime = $state(false);
	let heading = $state<HTMLElement>();

	const triedKey = $derived(`quiz-tried:${id}`);
	const current = $derived(questions[index]);
	const answer = $derived(answers[index]);
	const isLast = $derived(index === questions.length - 1);
	/** A question is complete once it has "I don't know", or an answer plus a confidence rating. */
	const complete = (a: Answer | undefined) => !!a && (a.dont_know || (a.chosen !== null && a.confidence !== null));

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

	function shuffled(n: number): number[] {
		const out = Array.from({ length: n }, (_, i) => i);
		for (let i = n - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[out[i], out[j]] = [out[j], out[i]];
		}
		return out;
	}

	async function start() {
		busy = true;
		message = '';
		try {
			const data = await post<StartResult>('/api/attempts/start', { mode: 'topic', quiz_id: id });
			token = data.token;
			questions = data.questions;
			order = data.questions.map((q) => shuffled(q.options.length));
			answers = data.questions.map(() => ({ chosen: null, dont_know: false, confidence: null }));
			result = undefined;
			await show(0);
		} catch (e) {
			message = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	/** Move to a question and put keyboard focus on it, so screen readers announce it. */
	async function show(i: number) {
		index = i;
		phase = 'question';
		await tick();
		heading?.focus();
	}

	function choose(value: number | 'dont_know') {
		const a = answers[index];
		if (value === 'dont_know') {
			answers[index] = { chosen: null, dont_know: true, confidence: null };
		} else {
			// Keep the confidence rating if they're just changing their answer.
			answers[index] = { chosen: value, dont_know: false, confidence: a.dont_know ? null : a.confidence };
		}
	}

	async function submit() {
		busy = true;
		message = '';
		try {
			result = await post<SubmitResult>('/api/attempts/submit', {
				token,
				answers: questions.map((q, i) => ({ question_id: q.id, ...answers[i] }))
			});
			try {
				localStorage.setItem(triedKey, '1');
			} catch {
				// Only used for the first-attempt message; fine without it.
			}
			firstTime = false;
			phase = 'feedback';
			await tick();
			heading?.focus();
		} catch (e) {
			message = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	// Feedback, grouped as in the spec. Each entry pairs a result with its question.
	type Item = { r: QuestionResult; q: PublicQuestion; n: number };
	const items = $derived<Item[]>(
		result ? result.results.map((r, i) => ({ r, q: questions.find((q) => q.id === r.question_id)!, n: i + 1 })) : []
	);
	const sureWrong = $derived(items.filter(({ r }) => !r.correct && r.confidence === 'sure'));
	const notYet = $derived(items.filter(({ r }) => !r.correct && r.confidence !== 'sure'));
	const lucky = $derived(items.filter(({ r }) => r.correct && r.confidence === 'guess'));
	const secure = $derived(items.filter(({ r }) => r.correct && r.confidence === 'sure'));

	const optionText = (q: PublicQuestion, i: number) => q.options[i]?.text ?? q.options[i]?.image_alt ?? '';
</script>

{#snippet optionContent(option: PublicQuestion['options'][number])}
	{#if option.image}<img src={option.image} alt={option.image_alt} class="quiz-option-img" />{/if}
	{#if option.text}<span>{option.text}</span>{/if}
{/snippet}

{#snippet feedbackItem({ r, q, n }: Item)}
	<div class="quiz-fb-item">
		<p class="quiz-fb-question"><span class="quiz-fb-num">Q{n}</span> {q.text}</p>
		{#if r.correct}
			<p class="quiz-fb-line quiz-fb-right">
				<span class="quiz-mark" aria-hidden="true">✓</span>
				<span><strong>Your answer, correct:</strong> {optionText(q, r.answer)}</span>
			</p>
		{:else}
			<p class="quiz-fb-line quiz-fb-wrong">
				{#if r.dont_know}
					<span class="quiz-mark" aria-hidden="true">?</span>
					<span><strong>You chose:</strong> I don't know</span>
				{:else}
					<span class="quiz-mark" aria-hidden="true">✗</span>
					<span>
						<strong>Your answer:</strong> {optionText(q, r.chosen!)}
						{#if r.why_wrong?.[r.chosen!]}<span class="quiz-fb-why">{r.why_wrong[r.chosen!]}</span>{/if}
					</span>
				{/if}
			</p>
			<p class="quiz-fb-line quiz-fb-right">
				<span class="quiz-mark" aria-hidden="true">✓</span>
				<span><strong>Correct answer:</strong> {optionText(q, r.answer)}</span>
			</p>
		{/if}
		<p class="quiz-fb-explanation">{r.explanation}</p>
		{#if r.see}<a class="quiz-fb-see" href={r.see}>Revise this →</a>{/if}
	</div>
{/snippet}

{#if phase !== 'hidden' && meta}
	<section class="quiz" aria-labelledby="quiz-heading-{id}">
		{#if phase === 'intro'}
			<h2 id="quiz-heading-{id}" class="quiz-title" tabindex="-1" bind:this={heading}>Quiz yourself</h2>
			<p class="quiz-intro">
				{meta.questions_per_attempt} questions on {meta.title}. It's low stakes: try it as many times as you like.
			</p>
			{#if firstTime}
				<p class="quiz-intro">It's fine to try this before reading the notes — having a go first helps you learn.</p>
			{/if}
			<button type="button" class="quiz-btn quiz-btn--primary" onclick={start} disabled={busy}>
				{busy ? 'Loading…' : 'Start the quiz'}
			</button>
		{:else if phase === 'question' && current && answer}
			<div class="quiz-progress">
				<span>Question {index + 1} of {questions.length}</span>
				<progress max={questions.length} value={index + 1} aria-hidden="true"></progress>
			</div>

			<h2 id="quiz-heading-{id}" class="quiz-question" tabindex="-1" bind:this={heading}>{current.text}</h2>
			{#if current.image}
				<img src={current.image} alt={current.image_alt} class="quiz-question-img" />
			{/if}

			<fieldset class="quiz-options">
				<legend class="visually-hidden">Choose one answer</legend>
				{#each order[index] as i (i)}
					<label class="quiz-option" class:selected={answer.chosen === i}>
						<input
							type="radio"
							name="quiz-{id}-q{index}"
							checked={answer.chosen === i}
							onchange={() => choose(i)}
						/>
						{@render optionContent(current.options[i])}
					</label>
				{/each}
				<label class="quiz-option quiz-option--dont-know" class:selected={answer.dont_know}>
					<input
						type="radio"
						name="quiz-{id}-q{index}"
						checked={answer.dont_know}
						onchange={() => choose('dont_know')}
					/>
					<span>I don't know</span>
				</label>
			</fieldset>
			<p class="quiz-hint">
				Not sure? Choosing "I don't know" doesn't count against you any more than a wrong answer, and it helps
				you and your teacher see what to revise.
			</p>

			{#if answer.chosen !== null}
				<fieldset class="quiz-confidence">
					<legend>How sure are you?</legend>
					<div class="quiz-confidence-choices">
						<label class="quiz-chip" class:selected={answer.confidence === 'sure'}>
							<input
								type="radio"
								name="quiz-{id}-q{index}-confidence"
								checked={answer.confidence === 'sure'}
								onchange={() => (answers[index].confidence = 'sure')}
							/>
							Sure
						</label>
						<label class="quiz-chip" class:selected={answer.confidence === 'guess'}>
							<input
								type="radio"
								name="quiz-{id}-q{index}-confidence"
								checked={answer.confidence === 'guess'}
								onchange={() => (answers[index].confidence = 'guess')}
							/>
							Guessing
						</label>
					</div>
					<p class="quiz-hint">This doesn't affect your score.</p>
				</fieldset>
			{/if}

			<div class="quiz-nav">
				{#if index > 0}
					<button type="button" class="quiz-btn" onclick={() => show(index - 1)}>← Back</button>
				{/if}
				{#if isLast}
					<button
						type="button"
						class="quiz-btn quiz-btn--primary"
						onclick={submit}
						disabled={busy || !answers.every(complete)}
					>
						{busy ? 'Marking…' : 'Submit answers'}
					</button>
				{:else}
					<button
						type="button"
						class="quiz-btn quiz-btn--primary"
						onclick={() => show(index + 1)}
						disabled={!complete(answer)}
					>
						Next →
					</button>
				{/if}
			</div>
			{#if !complete(answer)}
				<p class="quiz-hint" aria-live="polite">
					{answer.chosen === null ? 'Choose an answer to carry on.' : 'Pick "Sure" or "Guessing" to carry on.'}
				</p>
			{:else if isLast && !answers.every(complete)}
				<p class="quiz-hint" aria-live="polite">Some earlier questions aren't finished yet. Use Back to find them.</p>
			{/if}
		{:else if phase === 'feedback' && result}
			<h2 id="quiz-heading-{id}" class="quiz-title" tabindex="-1" bind:this={heading}>
				You scored {result.score} out of {result.max_score}
			</h2>

			{#if sureWrong.length}
				<div class="quiz-fb-group quiz-fb-group--alert">
					<h3>Check these carefully — you were sure but these were wrong</h3>
					{#each sureWrong as item (item.r.question_id)}{@render feedbackItem(item)}{/each}
				</div>
			{/if}
			{#if notYet.length}
				<div class="quiz-fb-group">
					<h3>Not right yet</h3>
					{#each notYet as item (item.r.question_id)}{@render feedbackItem(item)}{/each}
				</div>
			{/if}
			{#if lucky.length}
				<div class="quiz-fb-group">
					<h3>Lucky guesses</h3>
					<p class="quiz-hint">You got these right, but make sure you know why.</p>
					{#each lucky as item (item.r.question_id)}{@render feedbackItem(item)}{/each}
				</div>
			{/if}
			{#if secure.length}
				<details class="quiz-fb-group quiz-fb-group--correct">
					<summary>
						<span class="quiz-mark" aria-hidden="true">✓</span>
						{secure.length} correct and sure — show them
					</summary>
					{#each secure as item (item.r.question_id)}{@render feedbackItem(item)}{/each}
				</details>
			{/if}

			<div class="quiz-nav">
				<button type="button" class="quiz-btn quiz-btn--primary" onclick={start} disabled={busy}>
					{busy ? 'Loading…' : 'Try a new set of questions'}
				</button>
			</div>
		{/if}

		{#if message}
			<p class="quiz-error" role="alert">{message}</p>
		{/if}
	</section>
{/if}
