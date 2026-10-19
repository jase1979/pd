<script lang="ts">
	// One question on screen, for any type: radio buttons for one answer,
	// checkboxes for "Select TWO", a second set of radios for a two-tier
	// reason, and the exam-paper box for exam technique questions. Used by the
	// quiz itself and by "Try again now".
	import type { PublicOption, PublicQuestion } from '$lib/quiz/public';
	import { answered, selectLabel, type Draft } from '$lib/quiz/draft';
	import ExamPaper from './ExamPaper.svelte';

	let {
		question,
		order,
		draft = $bindable(),
		name,
		heading = $bindable(),
		describedBy,
		allowDontKnow = true,
		askConfidence = true,
		locked = false
	}: {
		question: PublicQuestion;
		/** Display order (original indexes) of the options and, for two_tier, the reasons. */
		order: { options: number[]; reasons: number[] };
		draft: Draft;
		/** Unique per question, for the radio group names. */
		name: string;
		heading?: HTMLElement;
		/** id of the scenario panel, so screen readers read it with the question. */
		describedBy?: string;
		allowDontKnow?: boolean;
		askConfidence?: boolean;
		/** True once a "Try again" answer has been checked. */
		locked?: boolean;
	} = $props();

	const multi = $derived(question.type === 'multi');
	const full = $derived(multi && draft.picks.length >= (question.select ?? 0));

	function pick(i: number) {
		if (multi) {
			draft.picks = draft.picks.includes(i) ? draft.picks.filter((p) => p !== i) : [...draft.picks, i];
		} else {
			draft.picks = [i];
		}
		if (draft.dont_know) {
			draft.dont_know = false;
			draft.confidence = null;
		}
	}

	function dontKnow() {
		// In a "Select TWO" question it's a checkbox, so a second click unticks it.
		if (draft.dont_know) {
			draft.dont_know = false;
			return;
		}
		draft.picks = [];
		draft.reason = null;
		draft.dont_know = true;
		draft.confidence = null;
	}
</script>

{#snippet optionContent(option: PublicOption)}
	{#if option.image}<img src={option.image} alt={option.image_alt} class="quiz-option-img" />{/if}
	{#if option.text}<span class="quiz-option-text">{option.text}</span>{/if}
{/snippet}

{#if question.exam_question}
	<ExamPaper question={question.exam_question.text} marks={question.exam_question.marks} sample={question.sample_answer} />
{/if}

<h2 class="quiz-question" tabindex="-1" bind:this={heading} aria-describedby={describedBy}>
	{question.text}
	{#if multi}<span class="quiz-select">{selectLabel(question.select ?? 2)}</span>{/if}
</h2>
{#if question.image}
	<img src={question.image} alt={question.image_alt} class="quiz-question-img" />
{/if}

<fieldset class="quiz-options" class:quiz-options--samples={question.format === 'best_answer'} disabled={locked}>
	<legend class="visually-hidden">
		{multi ? `${selectLabel(question.select ?? 2)} answers` : question.reason ? 'Choose an answer' : 'Choose one answer'}
	</legend>
	{#each order.options as i (i)}
		{@const selected = draft.picks.includes(i)}
		<label class="quiz-option" class:selected class:disabled={multi && full && !selected}>
			<input
				type={multi ? 'checkbox' : 'radio'}
				name="{name}-answer"
				checked={selected}
				disabled={multi && full && !selected}
				onchange={() => pick(i)}
			/>
			{@render optionContent(question.options[i])}
		</label>
	{/each}
	{#if allowDontKnow}
		<label class="quiz-option quiz-option--dont-know" class:selected={draft.dont_know}>
			<input type={multi ? 'checkbox' : 'radio'} name="{name}-answer" checked={draft.dont_know} onchange={dontKnow} />
			<span>I don't know</span>
		</label>
	{/if}
</fieldset>
{#if multi && !draft.dont_know}
	<p class="quiz-hint" aria-live="polite">{draft.picks.length} of {question.select} chosen.</p>
{/if}
{#if allowDontKnow}
	<p class="quiz-hint">
		Not sure? Choosing "I don't know" doesn't count against you any more than a wrong answer, and it helps you
		and your teacher see what to revise.
	</p>
{/if}

{#if question.reason && draft.picks.length === 1}
	<fieldset class="quiz-options quiz-reason" disabled={locked}>
		<legend class="quiz-reason-label">{question.reason.text}</legend>
		{#each order.reasons as i (i)}
			<label class="quiz-option" class:selected={draft.reason === i}>
				<input type="radio" name="{name}-reason" checked={draft.reason === i} onchange={() => (draft.reason = i)} />
				{@render optionContent(question.reason.options[i])}
			</label>
		{/each}
	</fieldset>
{/if}

{#if askConfidence && !draft.dont_know && answered(question, draft)}
	<fieldset class="quiz-confidence">
		<legend>How sure are you?</legend>
		<div class="quiz-confidence-choices">
			<label class="quiz-chip" class:selected={draft.confidence === 'sure'}>
				<input type="radio" name="{name}-confidence" checked={draft.confidence === 'sure'} onchange={() => (draft.confidence = 'sure')} />
				Sure
			</label>
			<label class="quiz-chip" class:selected={draft.confidence === 'guess'}>
				<input type="radio" name="{name}-confidence" checked={draft.confidence === 'guess'} onchange={() => (draft.confidence = 'guess')} />
				Guessing
			</label>
		</div>
		<p class="quiz-hint">This doesn't affect your score.</p>
	</fieldset>
{/if}
