<script lang="ts">
	// The quiz on a topic page: an intro, then QuizRunner. Shows nothing at all
	// unless /api/quiz/:id/meta says the quiz is available here.
	import { onMount } from 'svelte';
	import type { MistakeCounts, QuizMeta } from '$lib/quiz/public';
	import { logOut, refreshSession, session } from '$lib/session.svelte';
	import QuizRunner from './QuizRunner.svelte';

	let { id }: { id: string } = $props();

	let meta = $state<QuizMeta>();
	let running = $state(false);
	let firstTime = $state(false);
	let mistakes = $state(0);
	let heading = $state<HTMLElement>();

	const triedKey = $derived(`quiz-tried:${id}`);
	const cooldown = $derived(meta?.cooldown_until ? new Date(meta.cooldown_until) : null);

	async function load() {
		refreshSession();
		try {
			const res = await fetch(`/api/quiz/${encodeURIComponent(id)}/meta`);
			if (!res.ok) return; // no quiz rather than a broken one
			meta = await res.json();
		} catch {
			return;
		}
		if (meta?.attempted !== undefined) {
			firstTime = !meta.attempted;
		} else {
			// Not logged in: remember in this browser only.
			try {
				firstTime = localStorage.getItem(triedKey) === null;
			} catch {
				firstTime = true;
			}
		}
		if (session.username) {
			const res = await fetch('/api/student/mistakes').catch(() => null);
			const data: MistakeCounts | null = res?.ok ? await res.json() : null;
			mistakes = data?.by_quiz.find((m) => m.quiz_id === id)?.count ?? 0;
		}
	}

	onMount(load);

	function submitted() {
		try {
			localStorage.setItem(triedKey, '1');
		} catch {
			// Only used for the first-attempt message; fine without it.
		}
		firstTime = false;
	}

	async function exit() {
		running = false;
		await load();
		heading?.focus();
	}

	const when = (d: Date) =>
		d.toLocaleString('en-GB', { weekday: 'long', hour: 'numeric', minute: '2-digit' });
</script>

{#if meta?.available}
	<section class="quiz" aria-label="Quiz: {meta.title}">
		{#if running}
			<QuizRunner request={{ mode: 'topic', quiz_id: id }} name="quiz-{id}" onExit={exit} onSubmitted={submitted} />
		{:else}
			<h2 class="quiz-title" tabindex="-1" bind:this={heading}>Quiz yourself</h2>
			<p class="quiz-intro">
				{meta.questions_per_attempt} questions on {meta.title}. It's low stakes: try it as many times as you like.
			</p>
			{#if firstTime}
				<p class="quiz-intro">It's fine to try this before reading the notes — having a go first helps you learn.</p>
			{/if}
			{#if session.username}
				<p class="quiz-saving">
					Saving as <strong>{session.username}</strong>.
					<button type="button" class="quiz-link-btn" onclick={logOut}>Not you? Log out</button>
				</p>
			{:else}
				<p class="quiz-hint">Your answers are marked but not saved. <a href="/login/">Log in</a> to keep track of your progress.</p>
			{/if}

			{#if cooldown}
				<div class="quiz-notice">
					<p>
						<strong>Come back {when(cooldown)}</strong> — spacing it out helps it stick. In the meantime, try practising your
						mistakes or a mixed review.
					</p>
				</div>
			{/if}

			<div class="quiz-nav">
				<button type="button" class="quiz-btn quiz-btn--primary" onclick={() => (running = true)} disabled={!!cooldown}>
					Start the quiz
				</button>
				{#if mistakes > 0}
					<a class="quiz-btn" href="/review/?mode=mistakes&quiz={encodeURIComponent(id)}">Practise my mistakes ({mistakes})</a>
				{/if}
				{#if cooldown}
					<a class="quiz-btn" href="/review/">Mixed review</a>
				{/if}
			</div>
		{/if}
	</section>
{/if}
