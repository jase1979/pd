<script lang="ts">
	import type { GroupSummary } from '$lib/server/analysis';

	let { summary }: { summary: GroupSummary } = $props();

	const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
	const FORMAT_NAMES: Record<string, string> = {
		best_answer: 'Picking the best answer',
		missing_point: 'Finding the missing point',
		command_word: 'Command words'
	};
	const started = $derived(summary.topics.filter((t) => t.students > 0));
</script>

<div class="summary-grid">
	<div class="summary-card">
		<h3>Weakest spec points</h3>
		{#if summary.weakest_spec_points.length}
			<ol>
				{#each summary.weakest_spec_points as s (s.spec_point)}
					<li><strong>{s.spec_point}</strong> {pct(s.mastery)} <span class="quiz-hint">({s.students} student{s.students === 1 ? '' : 's'})</span></li>
				{/each}
			</ol>
		{:else}<p class="quiz-hint">No answers yet.</p>{/if}
	</div>

	<div class="summary-card">
		<h3>Command words</h3>
		{#if summary.command_profile.length}
			<ul class="summary-bars">
				{#each summary.command_profile as c (c.command)}
					<li>
						<span class="summary-bar-label">{c.command}</span>
						<span class="summary-bar" aria-hidden="true"><span style="width: {Math.round(c.credit * 100)}%"></span></span>
						<span>{pct(c.credit)}</span>
					</li>
				{/each}
			</ul>
		{:else}<p class="quiz-hint">No answers yet.</p>{/if}
	</div>

	<div class="summary-card">
		<h3>Exam technique</h3>
		{#if summary.exam_technique}
			<ul class="summary-bars">
				{#each summary.exam_technique.by_format as f (f.key)}
					<li>
						<span class="summary-bar-label">{FORMAT_NAMES[f.key] ?? f.key}</span>
						<span class="summary-bar" aria-hidden="true"><span style="width: {Math.round(f.credit * 100)}%"></span></span>
						<span>{pct(f.credit)}</span>
					</li>
				{/each}
			</ul>
			<p class="quiz-hint">By the command word of the exam question:</p>
			<ul class="summary-bars">
				{#each summary.exam_technique.by_command as c (c.key)}
					<li>
						<span class="summary-bar-label">{c.key}</span>
						<span class="summary-bar" aria-hidden="true"><span style="width: {Math.round(c.credit * 100)}%"></span></span>
						<span>{pct(c.credit)}</span>
					</li>
				{/each}
			</ul>
		{:else}<p class="quiz-hint">No exam technique answers yet.</p>{/if}
	</div>

	<div class="summary-card">
		<h3>Timed practice</h3>
		{#if summary.pace}
			<p>{summary.pace.students} student{summary.pace.students === 1 ? '' : 's'} reach <strong>{pct(summary.pace.reached)}</strong> of the questions on average.</p>
			{#if summary.pace.seconds_per_mark !== null}
				<p>About <strong>{Math.round(summary.pace.seconds_per_mark)} s</strong> a mark (target {summary.pace.target_seconds_per_mark} s).</p>
			{/if}
		{:else}<p class="quiz-hint">No timed practice yet.</p>{/if}
	</div>

	<div class="summary-card">
		<h3>Inactive for 14 days</h3>
		{#if summary.inactive.length}
			<p>
				{#each summary.inactive as s, i (s.id)}<a href="/teacher/student/?id={s.id}">{s.username}</a>{i < summary.inactive.length - 1 ? ', ' : ''}{/each}
			</p>
		{:else}<p>Everyone has been active. 🎉</p>{/if}
	</div>

	<div class="summary-card summary-card--wide">
		<h3>Starting point → latest</h3>
		{#if started.length}
			<table class="teacher-table">
				<thead><tr><th scope="col">Topic</th><th scope="col">Students</th><th scope="col">Starting point</th><th scope="col">Latest</th><th scope="col">Starting points taken</th><th scope="col">Overconfident</th></tr></thead>
				<tbody>
					{#each started as t (t.quiz_id)}
						<tr>
							<td>{t.title}</td>
							<td>{t.students}</td>
							<td>{pct(t.starting_point)}</td>
							<td><strong>{pct(t.latest)}</strong></td>
							<td>{t.before_notes} before notes, {t.after_notes} after</td>
							<td>
								{#if t.overconfident.length}
									{#each t.overconfident as s, i (s.id)}<a href="/teacher/student/?id={s.id}">{s.username}</a>{i < t.overconfident.length - 1 ? ', ' : ''}{/each}
								{:else}—{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}<p class="quiz-hint">No topic quizzes completed yet.</p>{/if}
	</div>
</div>
