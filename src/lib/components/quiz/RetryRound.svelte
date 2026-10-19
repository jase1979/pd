<script lang="ts">
	// "Try the ones you got wrong again now": re-asks the wrong, "I don't know"
	// and guessed questions with the options reshuffled, and checks each answer
	// straight away. It runs entirely in the browser, because the answers were
	// revealed when the attempt was submitted. Nothing is saved.
	import { onMount, tick } from 'svelte';
	import type { PublicQuestion, QuestionResult } from '$lib/quiz/public';
	import { mark } from '$lib/quiz/marking';
	import { emptyDraft, optionText, shuffledOrder, toChosen, complete, type Draft } from '$lib/quiz/draft';
	import QuestionCard from './QuestionCard.svelte';

	interface Item {
		question: PublicQuestion;
		result: QuestionResult;
	}

	let { items, name, onDone }: { items: Item[]; name: string; onDone: () => void } = $props();

	let round = $state<Item[]>([]);
	let index = $state(0);
	let draft = $state<Draft>(emptyDraft());
	let order = $state({ options: [] as number[], reasons: [] as number[] });
	let checked = $state(false);
	let rightThisTime = $state<Item[]>([]);
	let finished = $state(false);
	let heading = $state<HTMLElement>();

	const current = $derived(round[index]);
	const outcome = $derived(
		checked && current ? mark(current.question.type, current.result.answer, toChosen(current.question, draft)) : null
	);

	onMount(() => {
		start(items);
	});

	async function start(list: Item[]) {
		round = list;
		rightThisTime = [];
		finished = false;
		await show(0);
	}

	async function show(i: number) {
		index = i;
		draft = emptyDraft();
		const q = round[i].question;
		order = { options: shuffledOrder(q.options.length), reasons: shuffledOrder(q.reason?.options.length ?? 0) };
		checked = false;
		await tick();
		heading?.focus();
	}

	function check() {
		checked = true;
		if (outcome?.correct) rightThisTime = [...rightThisTime, current];
	}

	async function next() {
		if (index < round.length - 1) return show(index + 1);
		finished = true;
		await tick();
		heading?.focus();
	}

	/** why_wrong for each wrong option the student picked this time. */
	const reasonsWrong = $derived.by(() => {
		if (!checked || !current) return [] as string[];
		const { question: q, result: r } = current;
		const answers = Array.isArray(r.answer) ? r.answer : typeof r.answer === 'number' ? [r.answer] : [r.answer.answer];
		const out: string[] = [];
		for (const i of draft.picks) {
			if (!answers.includes(i) && r.why_wrong?.[i]) out.push(`${optionText(q.options[i])}: ${r.why_wrong[i]}`);
		}
		if (q.reason && draft.reason !== null && typeof r.answer === 'object' && !Array.isArray(r.answer)) {
			const why = r.reason_why_wrong?.[draft.reason];
			if (draft.reason !== r.answer.reason && why) out.push(`${optionText(q.reason.options[draft.reason])}: ${why}`);
		}
		return out;
	});
</script>

{#if finished}
	<h2 class="quiz-title" tabindex="-1" bind:this={heading}>
		You got {rightThisTime.length} of {round.length} right this time
	</h2>
	<p class="quiz-intro">
		Nothing from "Try again" is saved. Come back another day and try the quiz again to check it has stuck.
	</p>
	<div class="quiz-nav">
		{#if rightThisTime.length < round.length}
			<button
				type="button"
				class="quiz-btn quiz-btn--primary"
				onclick={() => start(round.filter((item) => !rightThisTime.includes(item)))}
			>
				Try the {round.length - rightThisTime.length} still wrong again
			</button>
		{/if}
		<button type="button" class="quiz-btn" onclick={onDone}>Back to your results</button>
	</div>
{:else if current}
	<div class="quiz-progress">
		<span>Try again: {index + 1} of {round.length}</span>
		<progress max={round.length} value={index + 1} aria-hidden="true"></progress>
	</div>
	{#if current.question.scenario}
		<div class="quiz-scenario" id="{name}-retry-scenario">
			<p class="quiz-exam-label">Scenario</p>
			{#if current.question.scenario.image}
				<img src={current.question.scenario.image} alt={current.question.scenario.image_alt} />
			{/if}
			<p>{current.question.scenario.text}</p>
		</div>
	{/if}
	{#key `${index}-${round.length}-${current.question.id}`}
		<QuestionCard
			question={current.question}
			{order}
			bind:draft
			bind:heading
			name="{name}-retry-{index}"
			describedBy={current.question.scenario ? `${name}-retry-scenario` : undefined}
			allowDontKnow={false}
			askConfidence={false}
			locked={checked}
		/>
	{/key}

	{#if outcome}
		<div class="quiz-fb-item" aria-live="polite">
			<div class="quiz-fb-line" class:quiz-fb-right={outcome.correct} class:quiz-fb-wrong={!outcome.correct}>
				<span class="quiz-mark" aria-hidden="true">{outcome.correct ? '✓' : '✗'}</span>
				<span>
					<strong>{outcome.correct ? 'Correct!' : `Not yet: ${outcome.marks} of ${outcome.max_marks} marks.`}</strong>
					{#each reasonsWrong as why (why)}<span class="quiz-fb-why">{why}</span>{/each}
				</span>
			</div>
			<p class="quiz-fb-explanation">{current.result.explanation}</p>
			{#if current.result.working}
				<div class="quiz-fb-working">
					<p class="quiz-exam-label">Worked solution</p>
					<p>{current.result.working}</p>
				</div>
			{/if}
			{#if current.result.see}<a class="quiz-fb-see" href={current.result.see}>Revise this →</a>{/if}
		</div>
	{/if}

	<div class="quiz-nav">
		{#if !checked}
			<button type="button" class="quiz-btn quiz-btn--primary" onclick={check} disabled={!complete(current.question, draft, false)}>
				Check
			</button>
		{:else}
			<button type="button" class="quiz-btn quiz-btn--primary" onclick={next}>
				{index < round.length - 1 ? 'Next →' : 'Finish'}
			</button>
		{/if}
		<button type="button" class="quiz-btn" onclick={onDone}>Back to your results</button>
	</div>
{/if}
