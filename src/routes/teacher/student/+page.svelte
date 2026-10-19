<script lang="ts">
	// One student's full profile, for their teacher.
	import { onMount } from 'svelte';
	import { pageTitle } from '$lib/site';
	import TeacherBar from '$lib/components/teacher/TeacherBar.svelte';
	import { idFromQuery, shortDate, teacherApi } from '$lib/teacher';
	import type { StudentProfile } from '$lib/server/analysis';

	type Profile = StudentProfile & { group: { id: number; name: string }; quiz_titles: Record<string, string> };

	let p = $state<Profile>();
	let message = $state('');

	onMount(async () => {
		const id = idFromQuery();
		if (id === null) {
			message = 'Student not found.';
			return;
		}
		try {
			p = await teacherApi<Profile>('GET', `/api/teacher/students/${id}`);
		} catch (e) {
			message = (e as Error).message;
		}
	});

	const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
	const MODES: Record<string, string> = { topic: 'Topic quiz', mistakes: 'Mistakes', mixed: 'Mixed review', technique: 'Exam technique', timed: 'Timed' };
	const FORMAT_NAMES: Record<string, string> = { best_answer: 'Best answer', missing_point: 'Missing point', command_word: 'Command words' };
</script>

<svelte:head>
	<title>{pageTitle(p ? `${p.student.username} (teacher)` : 'Student')}</title>
</svelte:head>

<TeacherBar />

<div class="teacher-page">
	{#if message}
		<p class="quiz-error" role="alert">{message}</p>
	{:else if !p}
		<p class="account-intro" aria-live="polite">Loading…</p>
	{:else}
		<p class="breadcrumb">
			<a href="/teacher/">Your groups</a> <span class="sep">/</span> <a href="/teacher/group/?id={p.group.id}">{p.group.name}</a> <span class="sep">/</span> {p.student.username}
		</p>
		<h1>{p.student.username}</h1>
		<p class="account-intro">
			Last active {shortDate(p.student.last_active_at)}
			{#if p.inactive}<span class="status-badge status-not_secure">Inactive for 14+ days</span>{/if}
			· {p.mistakes} mistake{p.mistakes === 1 ? '' : 's'} waiting to be practised
		</p>

		<section class="teacher-section">
			<h2>Topics</h2>
			<table class="teacher-table">
				<thead>
					<tr><th scope="col">Topic</th><th scope="col">Status</th><th scope="col">Mastery</th><th scope="col">Coverage</th><th scope="col">Starting point</th><th scope="col">Best</th><th scope="col">Latest</th></tr>
				</thead>
				<tbody>
					{#each p.topics as t (t.quiz_id)}
						<tr>
							<td>{t.title}{#if t.notes_viewed}<br /><span class="quiz-hint">notes viewed</span>{/if}</td>
							<td>
								<span class="status-badge status-{t.status}">{t.label}</span>
								{#if t.note}<br /><span class="quiz-hint">{t.note}</span>{/if}
								{#if t.status !== 'not_started' && !t.spacing_met}<br /><span class="quiz-hint">spacing not met yet</span>{/if}
								{#if t.overconfident}<br /><span class="heatmap-flag">⚠ overconfident</span>{/if}
							</td>
							<td>{pct(t.mastery)}</td>
							<td>{pct(t.coverage)}</td>
							<td>{pct(t.starting_point)}{#if t.starting_point !== undefined}<br /><span class="quiz-hint">{t.before_notes ? 'before notes' : 'after notes'}</span>{/if}</td>
							<td>{pct(t.best)}</td>
							<td>{pct(t.latest)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<div class="summary-grid">
			<section class="summary-card">
				<h3>Confidence</h3>
				{#if p.calibration.shown}
					<p>Sure: right {pct(p.calibration.sure?.right)} of {p.calibration.sure?.answers}</p>
					<p>Guessing: right {pct(p.calibration.guess?.right)} of {p.calibration.guess?.answers}</p>
					{#each p.calibration.messages as m (m)}<p class="quiz-hint">{m}</p>{/each}
				{:else}
					<p class="quiz-hint">{p.calibration.rated} of {p.calibration.needed} rated answers so far.</p>
				{/if}
			</section>

			<section class="summary-card">
				<h3>Command words</h3>
				{#if p.command_profile.length}
					<ul class="summary-bars">
						{#each p.command_profile as c (c.command)}
							<li><span class="summary-bar-label">{c.command}</span><span class="summary-bar" aria-hidden="true"><span style="width: {Math.round(c.credit * 100)}%"></span></span><span>{pct(c.credit)}</span></li>
						{/each}
					</ul>
				{:else}<p class="quiz-hint">No answers yet.</p>{/if}
			</section>

			<section class="summary-card">
				<h3>Exam technique</h3>
				{#if p.exam_technique}
					<p><span class="status-badge status-{p.exam_technique.status}">{p.exam_technique.label}</span> {pct(p.exam_technique.credit)} of the last {p.exam_technique.answers}</p>
					<ul class="summary-bars">
						{#each p.exam_technique.by_format as f (f.key)}
							<li><span class="summary-bar-label">{FORMAT_NAMES[f.key] ?? f.key}</span><span class="summary-bar" aria-hidden="true"><span style="width: {Math.round(f.credit * 100)}%"></span></span><span>{pct(f.credit)}</span></li>
						{/each}
						{#each p.exam_technique.by_command as c (c.key)}
							<li><span class="summary-bar-label">"{c.key}"</span><span class="summary-bar" aria-hidden="true"><span style="width: {Math.round(c.credit * 100)}%"></span></span><span>{pct(c.credit)}</span></li>
						{/each}
					</ul>
				{:else}<p class="quiz-hint">None yet.</p>{/if}
			</section>

			<section class="summary-card">
				<h3>Timed practice</h3>
				{#if p.pace}
					<p>Reaches {pct(p.pace.reached)} of questions{#if p.pace.seconds_per_mark !== null}, {Math.round(p.pace.seconds_per_mark)} s a mark (target {p.pace.target_seconds_per_mark}){/if}.</p>
					<ul class="summary-list">
						{#each p.timed_scores as t (t.completed_at)}
							<li>{shortDate(t.completed_at)}: {pct(t.score)}, reached {pct(t.reached)}{t.overtime ? ' (overtime)' : ''}</li>
						{/each}
					</ul>
				{:else}<p class="quiz-hint">None yet.</p>{/if}
			</section>
		</div>

		<section class="teacher-section">
			<h2>Attempts</h2>
			{#if p.attempts.length}
				<table class="teacher-table">
					<thead><tr><th scope="col">When</th><th scope="col">Mode</th><th scope="col">Topic</th><th scope="col">Score</th></tr></thead>
					<tbody>
						{#each p.attempts as a (a.id)}
							<tr>
								<td>{shortDate(a.completed_at)}</td>
								<td>{MODES[a.mode] ?? a.mode}</td>
								<td>{a.quiz_id ? (p.quiz_titles[a.quiz_id] ?? a.quiz_id) : '—'}</td>
								<td>{a.score} / {a.max_score}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}<p class="account-intro">No attempts yet.</p>{/if}
		</section>
	{/if}
</div>
