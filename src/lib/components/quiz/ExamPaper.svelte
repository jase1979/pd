<script lang="ts">
	// The exam question an exam_skill question is about, styled like an exam
	// paper, with the sample answer below it for missing_point questions.
	let { question, marks, sample }: { question: string; marks: number; sample?: string } = $props();
</script>

<div class="quiz-exam-paper">
	<p class="quiz-exam-label">Exam question</p>
	<p class="quiz-exam-question">
		{question}
		<span class="quiz-exam-marks">[{marks} {marks === 1 ? 'mark' : 'marks'}]</span>
	</p>
	{#if sample}
		<div class="quiz-exam-sample">
			<p class="quiz-exam-label">A student's answer</p>
			<p>{sample}</p>
		</div>
	{/if}
</div>
