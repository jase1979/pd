<script lang="ts">
	// Per-question analysis: one row per question, most confidently-wrong first.
	import type { QuestionStat } from '$lib/server/analysis';

	let { questions }: { questions: QuestionStat[] } = $props();
	const pct = (v: number) => `${Math.round(v * 100)}%`;
</script>

{#if questions.length === 0}
	<p class="account-intro">No answers yet.</p>
{:else}
	<p class="quiz-hint">Sorted by how often students were sure but wrong: these are the most stubborn misconceptions.</p>
	<table class="teacher-table question-table">
		<thead>
			<tr>
				<th scope="col">Question</th>
				<th scope="col">Answers</th>
				<th scope="col">Correct</th>
				<th scope="col">"I don't know"</th>
				<th scope="col">Sure but wrong</th>
				<th scope="col">Most common wrong answer</th>
			</tr>
		</thead>
		<tbody>
			{#each questions as q (q.question_id)}
				<tr>
					<td><span class="quiz-hint">{q.question_id}</span><br />{q.text}</td>
					<td>{q.answers}</td>
					<td>{pct(q.correct_rate)}</td>
					<td>{pct(q.dont_know_rate)}</td>
					<td><strong>{pct(q.confidently_wrong_rate)}</strong></td>
					<td>
						{#if q.most_common_wrong}
							<strong>{q.most_common_wrong.text}</strong> ({pct(q.most_common_wrong.rate)})
							{#if q.most_common_wrong.why_wrong}<br /><span class="quiz-hint">{q.most_common_wrong.why_wrong}</span>{/if}
						{:else}—{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
