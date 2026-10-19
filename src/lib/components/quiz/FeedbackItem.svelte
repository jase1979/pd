<script lang="ts">
	// Feedback for one question after submitting: what the student chose and
	// why it was wrong, the correct answer and why it's right, the worked
	// solution for calculations, every sample answer's marks for best_answer
	// questions, and a "Revise this" link.
	import type { PublicQuestion, QuestionResult } from '$lib/quiz/public';
	import { optionText } from '$lib/quiz/draft';
	import ExamPaper from './ExamPaper.svelte';

	let { result: r, question: q, number }: { result: QuestionResult; question: PublicQuestion; number: number } =
		$props();

	const chosenList = $derived(
		r.chosen === null ? [] : Array.isArray(r.chosen) ? r.chosen : typeof r.chosen === 'number' ? [r.chosen] : [r.chosen.answer]
	);
	const answerList = $derived(
		Array.isArray(r.answer) ? r.answer : typeof r.answer === 'number' ? [r.answer] : [r.answer.answer]
	);
	const chosenReason = $derived(r.chosen !== null && typeof r.chosen === 'object' && !Array.isArray(r.chosen) ? r.chosen.reason : null);
	const correctReason = $derived(typeof r.answer === 'object' && !Array.isArray(r.answer) ? r.answer.reason : null);
	const bestAnswer = $derived(q.format === 'best_answer' && r.marks_awarded);
	const marksLabel = (n: number) => `${n} ${n === 1 ? 'mark' : 'marks'}`;
</script>

{#snippet line(right: boolean, label: string, text: string, why?: string | null)}
	<div class="quiz-fb-line" class:quiz-fb-right={right} class:quiz-fb-wrong={!right}>
		<span class="quiz-mark" aria-hidden="true">{right ? '✓' : '✗'}</span>
		<span>
			<strong>{label}</strong> {text}
			{#if why}<span class="quiz-fb-why">{why}</span>{/if}
		</span>
	</div>
{/snippet}

<div class="quiz-fb-item">
	{#if q.scenario}<p class="quiz-fb-scenario">{q.scenario.text}</p>{/if}
	{#if q.exam_question}
		<ExamPaper question={q.exam_question.text} marks={q.exam_question.marks} sample={q.sample_answer} />
	{/if}
	<p class="quiz-fb-question">
		<span class="quiz-fb-num">Q{number}</span>
		{q.text}
		{#if r.max_marks > 1}<span class="quiz-fb-marks">{r.marks} of {r.max_marks} marks</span>{/if}
	</p>

	{#if r.dont_know}
		<div class="quiz-fb-line quiz-fb-wrong">
			<span class="quiz-mark" aria-hidden="true">?</span>
			<span><strong>You chose:</strong> I don't know</span>
		</div>
	{/if}

	{#if bestAnswer}
		<!-- Every sample answer with its marks, so the whole range from weak to full marks is visible. -->
		<ol class="quiz-fb-samples">
			{#each q.options as option, i (i)}
				{@const best = answerList.includes(i)}
				<li class="quiz-fb-sample" class:quiz-fb-right={best}>
					<p class="quiz-fb-sample-head">
						<span class="quiz-fb-sample-marks">{marksLabel(r.marks_awarded![i])}</span>
						{#if best}<span><span aria-hidden="true">✓</span> Best answer</span>{/if}
						{#if chosenList.includes(i)}<span class="quiz-fb-you">Your choice</span>{/if}
					</p>
					<p>{optionText(option)}</p>
					<p class="quiz-fb-why">{best ? r.explanation : r.why_wrong?.[i]}</p>
				</li>
			{/each}
		</ol>
	{:else}
		{#each chosenList as i (i)}
			{@const right = answerList.includes(i)}
			{@render line(right, q.reason ? 'Your answer:' : 'You chose:', optionText(q.options[i]), right ? null : r.why_wrong?.[i])}
		{/each}
		{#if chosenReason !== null && q.reason}
			{@const right = chosenReason === correctReason && chosenList[0] === answerList[0]}
			{@render line(
				right,
				'Your reason:',
				optionText(q.reason.options[chosenReason]),
				chosenReason === correctReason
					? chosenList[0] === answerList[0]
						? null
						: 'This reason is right, but it only earns its mark when the answer is correct too.'
					: r.reason_why_wrong?.[chosenReason]
			)}
		{/if}
		{#if !r.correct}
			{#each answerList.filter((i) => !chosenList.includes(i)) as i (i)}
				{@render line(true, answerList.length > 1 ? 'Also correct:' : 'Correct answer:', optionText(q.options[i]))}
			{/each}
			{#if q.reason && correctReason !== null && chosenReason !== correctReason}
				{@render line(true, 'Correct reason:', optionText(q.reason.options[correctReason]))}
			{/if}
		{/if}
		<p class="quiz-fb-explanation">{r.explanation}</p>
	{/if}

	{#if r.working}
		<div class="quiz-fb-working">
			<p class="quiz-exam-label">Worked solution</p>
			<p>{r.working}</p>
		</div>
	{/if}
	{#if r.see}<a class="quiz-fb-see" href={r.see}>Revise this →</a>{/if}
</div>
