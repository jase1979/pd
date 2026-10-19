<script lang="ts">
	// The student's progress page, in the order the spec asks for: improvement
	// first, then what to do next, then the topic statuses, exam technique,
	// timed practice and finally calibration. Growth before ratings.
	import { onMount } from 'svelte';
	import { pageTitle } from '$lib/site';
	import { logOut, refreshSession, session } from '$lib/session.svelte';
	import { dueLabel, type ProgressData, type StudentWork, type TopicProgress } from '$lib/quiz/public';

	let data = $state<ProgressData>();
	let work = $state<StudentWork[]>([]);
	let status = $state<'loading' | 'ready' | 'logged-out' | 'error'>('loading');

	onMount(async () => {
		refreshSession();
		try {
			const res = await fetch('/api/student/progress');
			if (res.status === 401) {
				status = 'logged-out';
				return;
			}
			if (!res.ok) throw new Error();
			data = await res.json();
			status = 'ready';
			const w = await fetch('/api/student/assignments').catch(() => null);
			work = w?.ok ? ((await w.json()) as { assignments: StudentWork[] }).assignments : [];
		} catch {
			status = 'error';
		}
	});

	const pct = (x: number | undefined) => `${Math.round((x ?? 0) * 100)}%`;
	const withScores = $derived(data?.topics.filter((t) => t.starting_point !== undefined) ?? []);
	const averageImprovement = $derived(
		withScores.length ? withScores.reduce((s, t) => s + (t.improvement ?? 0), 0) / withScores.length : null
	);

	const FORMAT_NAMES: Record<string, string> = {
		best_answer: 'picking the answer that scores most',
		missing_point: 'spotting the missing point',
		command_word: 'what command words ask for'
	};

	const statusIcon: Record<TopicProgress['status'], string> = {
		secure: '✓',
		getting_there: '◐',
		not_secure: '!',
		not_started: '○'
	};
</script>

<svelte:head>
	<title>{pageTitle('My progress')}</title>
</svelte:head>

<div class="account-page account-page--wide progress-page">
	<h1>My progress</h1>

	{#if status === 'loading'}
		<p class="account-intro" aria-live="polite">Loading your progress…</p>
	{:else if status === 'logged-out'}
		<p class="account-intro">Log in with your code to see your progress.</p>
		<a class="quiz-btn quiz-btn--primary" href="/login/?next=/progress/">Log in</a>
	{:else if status === 'error' || !data}
		<p class="quiz-error" role="alert">Your progress couldn't be loaded. Please try again in a moment.</p>
	{:else}
		<p class="quiz-saving">
			Showing progress for <strong>{data.username}</strong>.
			<button type="button" class="quiz-link-btn" onclick={logOut}>Not you? Log out</button>
		</p>

		<!-- Set work, when there is any: the most urgent thing on the page -->
		{#if work.length}
			<section class="progress-section" aria-labelledby="work-heading">
				<h2 id="work-heading">Set work</h2>
				<ul class="work-list">
					{#each work as w (w.id)}
						<li>
							<a href="/review/?assignment={w.id}" class="work-title">{w.title}</a>
							{#if w.assessment}<span class="quiz-hint">Assessment</span>{/if}
							<span class="quiz-hint">Due {dueLabel(w.due_date)}</span>
							<span class="status-badge work-{w.status}">{w.label}{#if w.best !== null} · {Math.round(w.best * 100)}%{/if}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- 1. Improvement comes first -->
		<section class="progress-section">
			<h2>Your progress</h2>
			{#if withScores.length === 0}
				<p class="account-intro">Do a topic quiz to see your starting point. It's fine to try one before reading the notes.</p>
			{:else}
				{#if averageImprovement !== null && withScores.length > 1}
					<p class="progress-headline">
						On average you've improved by <strong>{Math.round(averageImprovement * 100)} percentage points</strong> since your starting points.
					</p>
				{/if}
				<ul class="progress-growth">
					{#each withScores as t (t.quiz_id)}
						<li>
							<a href={t.page}>{t.title}</a>
							<span class="progress-growth-scores">
								<span class="progress-from">{pct(t.starting_point)}</span>
								<span aria-hidden="true">→</span>
								<span class="visually-hidden">to</span>
								<strong>{pct(t.latest)}</strong>
								{#if (t.improvement ?? 0) > 0}
									<span class="progress-up">+{Math.round((t.improvement ?? 0) * 100)}</span>
								{/if}
							</span>
							<span class="quiz-hint">Starting point {pct(t.starting_point)} · best {pct(t.best)} · latest {pct(t.latest)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- 2. What to do next -->
		<section class="progress-section">
			<h2>Suggested next</h2>
			{#if data.suggested}
				<p class="progress-suggestion"><a href={data.suggested.url}>{data.suggested.text} →</a></p>
			{/if}
			<div class="quiz-nav">
				{#if data.mistakes.total > 0}
					<a class="quiz-btn quiz-btn--primary" href="/review/?mode=mistakes">Practise my mistakes ({data.mistakes.total})</a>
				{:else}
					<span class="quiz-hint">No mistakes waiting.</span>
				{/if}
				<a class="quiz-btn" href="/review/?mode=mixed">Mixed review</a>
			</div>
		</section>

		<!-- 3. Topic status grid: the text label is the status; colour only backs it up -->
		<section class="progress-section">
			<h2>Topics</h2>
			<ul class="progress-grid">
				{#each data.topics as t (t.quiz_id)}
					<li class="progress-topic status-{t.status}">
						<a href={t.page} class="progress-topic-title">{t.title}</a>
						<span class="status-badge status-{t.status}">
							<span aria-hidden="true">{statusIcon[t.status]}</span>
							{t.label}{#if t.note}<span class="status-note"> — {t.note}</span>{/if}
						</span>
						{#if t.mastery !== undefined}
							<span class="quiz-hint">{pct(t.mastery)} of the ideas secure · {pct(t.coverage)} of the topic tried</span>
						{/if}
					</li>
				{/each}
			</ul>
		</section>

		<!-- 4. Exam technique -->
		<section class="progress-section">
			<h2>Exam technique</h2>
			{#if data.exam_technique}
				{@const t = data.exam_technique}
				<p>
					<span class="status-badge status-{t.status}">{t.label}</span>
					<span class="quiz-hint">from your last {t.answers} exam technique answers</span>
				</p>
				{#if t.weakest_format}
					<p>To work on: <strong>{FORMAT_NAMES[t.weakest_format] ?? t.weakest_format}</strong>{#if t.weakest_command}, and <strong>"{t.weakest_command}"</strong> questions{/if}.</p>
				{/if}
			{:else}
				<p class="account-intro">No exam technique questions yet. These help you see what earns marks.</p>
			{/if}
			<a class="quiz-btn" href="/exam-technique/">Exam technique</a>
		</section>

		<!-- 5. Timed practice -->
		<section class="progress-section">
			<h2>Timed practice</h2>
			{#if data.pace}
				{@const p = data.pace}
				<p>Latest timed score: <strong>{pct(p.latest_score)}</strong></p>
				{#if p.reached !== null}
					<p>
						On average you reach <strong>{pct(p.reached)}</strong> of the questions{#if p.seconds_per_mark !== null}, at about
							<strong>{Math.round(p.seconds_per_mark)} seconds a mark</strong> (the target is {p.target_seconds_per_mark}){/if}.
					</p>
				{/if}
			{:else}
				<p class="account-intro">Timed practice builds your pace for the real exam.</p>
			{/if}
			<a class="quiz-btn" href="/review/?mode=timed">Timed practice</a>
		</section>

		<!-- 6. Calibration, once there's enough data -->
		<section class="progress-section">
			<h2>How well you know what you know</h2>
			{#if data.calibration.shown}
				{@const c = data.calibration}
				<ul class="progress-calibration">
					{#if c.sure?.answers}<li>When you said <strong>Sure</strong>, you were right <strong>{pct(c.sure.right ?? 0)}</strong> of the time.</li>{/if}
					{#if c.guess?.answers}<li>When you said <strong>Guessing</strong>, you were right <strong>{pct(c.guess.right ?? 0)}</strong> of the time.</li>{/if}
				</ul>
				{#each c.messages as m (m)}<p class="quiz-notice">{m}</p>{/each}
			{:else}
				<p class="account-intro">
					This appears once you've rated {data.calibration.needed} answers as "Sure" or "Guessing" (you've rated {data.calibration.rated} so far).
				</p>
			{/if}
		</section>
	{/if}
</div>
