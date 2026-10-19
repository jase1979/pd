<script lang="ts">
	// Question health across every group the teacher can see: which questions
	// need improving. Exports a CSV with each question's id and quiz file.
	import { onMount } from 'svelte';
	import { pageTitle } from '$lib/site';
	import TeacherBar from '$lib/components/teacher/TeacherBar.svelte';
	import { teacherApi } from '$lib/teacher';
	import type { QuestionHealth } from '$lib/server/analysis';

	let data = $state<{ min_answers: number; questions: QuestionHealth[] }>();
	let onlyFlagged = $state(true);
	const shown = $derived(data ? data.questions.filter((q) => !onlyFlagged || q.flags.length) : []);

	onMount(async () => {
		data = await teacherApi('GET', '/api/teacher/question-health');
	});

	const pct = (v: number) => `${Math.round(v * 100)}%`;
	const FLAG_NAMES: Record<string, string> = {
		option_not_working: 'Option not working',
		too_easy: 'Too easy',
		poor_discrimination: 'Poor discrimination',
		high_dont_know: 'High "I don\'t know"'
	};
</script>

<svelte:head>
	<title>{pageTitle('Question health')}</title>
</svelte:head>

<TeacherBar />

<div class="teacher-page">
	<h1>Question health</h1>
	<p class="account-intro">
		For improving the questions, across all your groups. A question is only judged once it has {data?.min_answers ?? 30} answers.
	</p>
	<ul class="summary-list">
		<li><strong>Option not working</strong>: a wrong option chosen in under 5% of answers. It isn't drawing out a misconception; replace it.</li>
		<li><strong>Too easy</strong>: more than 90% correct.</li>
		<li><strong>Poor discrimination</strong>: the strongest third of students do barely better than the weakest third. It may be ambiguous.</li>
		<li><strong>High "I don't know"</strong>: over 40%. Unclear, or the topic needs re-teaching.</li>
	</ul>

	<div class="quiz-nav">
		<label class="account-check"><input type="checkbox" bind:checked={onlyFlagged} /> Only show flagged questions</label>
		<a class="quiz-btn" href="/api/teacher/question-health?format=csv" download>Download CSV</a>
	</div>

	{#if !data}
		<p class="account-intro" aria-live="polite">Loading…</p>
	{:else if shown.length === 0}
		<p class="account-intro">{data.questions.length ? 'No questions are flagged.' : `No question has ${data.min_answers} answers yet.`}</p>
	{:else}
		<table class="teacher-table question-table">
			<thead>
				<tr><th scope="col">Question</th><th scope="col">Answers</th><th scope="col">Correct</th><th scope="col">Flags</th></tr>
			</thead>
			<tbody>
				{#each shown as q (q.question_id)}
					<tr>
						<td><span class="quiz-hint">{q.question_id} · {q.file}</span><br />{q.text}</td>
						<td>{q.answers}</td>
						<td>{pct(q.correct_rate)}</td>
						<td>
							{#each q.flags as f, i (i)}<div><strong>{FLAG_NAMES[f.kind]}</strong>: {f.text}</div>{:else}—{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
