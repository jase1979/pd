<script lang="ts">
	// The lesson-starter board view: questions one at a time in large text for
	// the class to answer on paper or mini whiteboards. "Reveal" shows the
	// answer, the explanation and why each wrong option is wrong. Nothing is
	// saved. Keys: → next, ← back, R reveal.
	//
	// /teacher/starter/?group=12&topics=weakest&n=5 starts straight away.
	import { onMount, tick } from 'svelte';
	import { pageTitle } from '$lib/site';
	import TeacherBar from '$lib/components/teacher/TeacherBar.svelte';
	import ExamPaper from '$lib/components/quiz/ExamPaper.svelte';
	import { teacherApi, type Group } from '$lib/teacher';
	import { optionText } from '$lib/quiz/draft';
	import type { QuizSummary } from '$lib/quiz/public';
	import type { Option, Question, Scenario } from '$lib/server/quiz/types';

	type StarterQuestion = Question & { scenario?: Scenario };

	let groups = $state<Group[]>([]);
	let topics = $state<QuizSummary[]>([]);
	let groupId = $state('');
	let weakest = $state(true);
	let chosen = $state<string[]>([]);
	let n = $state(5);
	let message = $state('');

	let questions = $state<StarterQuestion[]>([]);
	let topicNames = $state<string[]>([]);
	let index = $state(0);
	let revealed = $state(false);
	let board = $state<HTMLElement>();

	const current = $derived(questions[index]);
	const LETTERS = 'ABCDEFGH';

	onMount(async () => {
		const params = new URLSearchParams(location.search);
		const [g, q] = await Promise.all([
			teacherApi<{ groups: Group[] }>('GET', '/api/teacher/groups'),
			fetch('/api/quizzes').then((r): Promise<QuizSummary[]> => (r.ok ? r.json() : Promise.resolve([])))
		]);
		groups = g.groups.filter((x) => !x.archived);
		topics = q.filter((x) => x.available);
		groupId = params.get('group') ?? (groups[0] ? String(groups[0].id) : '');
		const t = params.get('topics');
		if (t && t !== 'weakest') {
			weakest = false;
			chosen = t.split(',');
		}
		if (params.get('n')) n = Number(params.get('n')) || 5;
		if (params.get('group') && params.get('topics')) await start();
	});

	async function start() {
		message = '';
		try {
			const query = new URLSearchParams({ group_id: groupId, topics: weakest ? 'weakest' : chosen.join(','), n: String(n) });
			const data = await teacherApi<{ topics: { id: string; title: string }[]; questions: StarterQuestion[] }>('GET', `/api/teacher/starter?${query}`);
			if (data.questions.length === 0) {
				message = 'No questions available for those topics yet.';
				return;
			}
			questions = data.questions;
			topicNames = data.topics.map((t) => t.title);
			index = 0;
			revealed = false;
			history.replaceState(history.state, '', `?${new URLSearchParams({ group: groupId, topics: weakest ? 'weakest' : chosen.join(','), n: String(n) })}`);
			await tick();
			board?.focus();
		} catch (e) {
			message = (e as Error).message;
		}
	}

	function go(step: number) {
		const next = index + step;
		if (next < 0 || next >= questions.length) return;
		index = next;
		revealed = false;
	}

	function onKey(event: KeyboardEvent) {
		if (questions.length === 0 || (event.target as HTMLElement)?.closest('input, select, textarea')) return;
		if (event.key === 'ArrowRight') go(1);
		else if (event.key === 'ArrowLeft') go(-1);
		else if (event.key.toLowerCase() === 'r') revealed = true;
	}

	function fullScreen() {
		if (document.fullscreenElement) document.exitFullscreen();
		else board?.requestFullscreen?.();
	}

	const correctSet = (q: StarterQuestion) => new Set(q.type === 'multi' ? q.answer : [q.answer]);
	const marksOf = (o: Option) => (o.marks_awarded === undefined ? '' : `${o.marks_awarded} mark${o.marks_awarded === 1 ? '' : 's'}`);
</script>

<svelte:head>
	<title>{pageTitle('Lesson starter')}</title>
</svelte:head>

<svelte:window onkeydown={onKey} />

<TeacherBar />

{#if questions.length === 0}
	<div class="teacher-page">
		<h1>Lesson starter</h1>
		<p class="account-intro">
			Questions shown one at a time on the board, for the class to answer on paper or mini whiteboards. Nothing is saved.
		</p>
		<form class="account-form" onsubmit={(e) => (e.preventDefault(), start())}>
			<label for="starter-group">Group</label>
			<select id="starter-group" class="account-input" bind:value={groupId}>
				{#each groups as g (g.id)}<option value={String(g.id)}>{g.name}</option>{/each}
			</select>

			<fieldset class="practice-topics">
				<legend>Topics</legend>
				<label class="quiz-option" class:selected={weakest}>
					<input type="radio" name="starter-topics" checked={weakest} onchange={() => (weakest = true)} />
					<span>This group's weakest topics</span>
				</label>
				<label class="quiz-option" class:selected={!weakest}>
					<input type="radio" name="starter-topics" checked={!weakest} onchange={() => (weakest = false)} />
					<span>Choose topics</span>
				</label>
				{#if !weakest}
					{#each topics as t (t.id)}
						<label class="quiz-option starter-topic" class:selected={chosen.includes(t.id)}>
							<input type="checkbox" checked={chosen.includes(t.id)} onchange={() => (chosen = chosen.includes(t.id) ? chosen.filter((c) => c !== t.id) : [...chosen, t.id])} />
							<span>{t.title}</span>
						</label>
					{/each}
				{/if}
			</fieldset>

			<label for="starter-n">Number of questions</label>
			<input id="starter-n" class="account-input starter-n" type="number" min="1" max="20" bind:value={n} />
			{#if message}<p class="quiz-error" role="alert">{message}</p>{/if}
			<button type="submit" class="quiz-btn quiz-btn--primary" disabled={!groupId || (!weakest && chosen.length === 0)}>Start</button>
		</form>
	</div>
{:else if current}
	<div class="starter-board" bind:this={board} tabindex="-1">
		<div class="starter-top">
			<span>{topicNames.join(' · ')}</span>
			<span>Question {index + 1} of {questions.length}</span>
		</div>

		{#if current.scenario}<p class="starter-scenario">{current.scenario.text}</p>{/if}
		{#if current.type === 'exam_skill'}
			<ExamPaper question={current.exam_question.text} marks={current.exam_question.marks} sample={current.sample_answer} />
		{/if}
		<h2 class="starter-question">
			{current.text}
			{#if current.type === 'multi'}<span class="quiz-select">Select {current.answer.length === 2 ? 'TWO' : current.answer.length}</span>{/if}
		</h2>
		{#if current.image}<img class="starter-image" src={current.image} alt={current.image_alt} />{/if}

		<ol class="starter-options">
			{#each current.options as o, i (i)}
				{@const right = correctSet(current).has(i)}
				<li class:starter-right={revealed && right} class:starter-wrong={revealed && !right}>
					<span class="starter-letter">{LETTERS[i]}</span>
					<span class="starter-option">
						{#if o.image}<img src={o.image} alt={o.image_alt} />{/if}
						{optionText(o)}
						{#if revealed}
							<span class="starter-why">
								{right ? '✓ Correct' : `✗ ${o.why_wrong ?? ''}`}
								{#if marksOf(o)} ({marksOf(o)}){/if}
							</span>
						{/if}
					</span>
				</li>
			{/each}
		</ol>

		{#if current.type === 'two_tier'}
			<p class="starter-reason-label">{current.reason.text}</p>
			<ol class="starter-options">
				{#each current.reason.options as o, i (i)}
					{@const right = i === current.reason.answer}
					<li class:starter-right={revealed && right} class:starter-wrong={revealed && !right}>
						<span class="starter-letter">{LETTERS[i].toLowerCase()}</span>
						<span class="starter-option">
							{optionText(o)}
							{#if revealed}<span class="starter-why">{right ? '✓ Correct' : `✗ ${o.why_wrong ?? ''}`}</span>{/if}
						</span>
					</li>
				{/each}
			</ol>
		{/if}

		{#if revealed}
			<div class="starter-explanation">
				<p>{current.explanation}</p>
				{#if current.working}<p class="starter-working">{current.working}</p>{/if}
			</div>
		{/if}

		<div class="starter-controls">
			<button type="button" class="quiz-btn" onclick={() => go(-1)} disabled={index === 0}>← Back</button>
			{#if !revealed}
				<button type="button" class="quiz-btn quiz-btn--primary" onclick={() => (revealed = true)}>Reveal</button>
			{:else if index < questions.length - 1}
				<button type="button" class="quiz-btn quiz-btn--primary" onclick={() => go(1)}>Next →</button>
			{/if}
			<button type="button" class="quiz-btn" onclick={fullScreen}>Full screen</button>
			<button type="button" class="quiz-btn" onclick={() => (questions = [])}>Finish</button>
		</div>
	</div>
{/if}
