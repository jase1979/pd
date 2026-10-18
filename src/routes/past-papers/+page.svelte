<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { pageTitle } from '$lib/site';

	let { data } = $props();

	let paper = $state('all');
	let topic = $state('all');
	let marks = $state('all');
	let type = $state('all');

	// Which cards are expanded, and which mark schemes are showing ("cardId:partIndex").
	const open = new SvelteSet<string>();
	const revealed = new SvelteSet<string>();

	// Newest paper first, labelled "2024 — S24-3603U10-1".
	const papers = $derived(
		[...new Set(data.questions.map((q) => `${q.year}|${q.paper}`))]
			.sort()
			.reverse()
			.map((p) => {
				const [year, code] = p.split('|');
				return { value: code, label: `${year} — ${code}` };
			})
	);
	const topics = $derived([...new Set(data.questions.map((q) => q.topic))].sort());

	function inMarksRange(m: number): boolean {
		if (marks === '1-10') return m >= 1 && m <= 10;
		if (marks === '11-20') return m >= 11 && m <= 20;
		if (marks === '21+') return m >= 21;
		return true;
	}

	const visible = $derived(
		data.questions.filter(
			(q) =>
				(paper === 'all' || q.paper === paper) &&
				(topic === 'all' || q.topic === topic) &&
				(type === 'all' || q.type === type) &&
				inMarksRange(q.total_marks)
		)
	);
	const visibleIds = $derived(new Set(visible.map((q) => q.id)));

	function toggle(set: SvelteSet<string>, key: string) {
		if (set.has(key)) set.delete(key);
		else set.add(key);
	}

	// A link like /past-papers/#s24-q1 opens that question.
	onMount(() => {
		const id = decodeURIComponent(location.hash.slice(1));
		if (!data.questions.some((q) => q.id === id)) return;
		open.add(id);
		requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
	});
</script>

<svelte:head>
	<title>{pageTitle('Past Paper Questions')}</title>
</svelte:head>

<div class="past-papers-page">
	<div class="breadcrumb">
		<a href="/">Home</a>
		<span class="sep">/</span>
		<span>Past Papers</span>
	</div>

	<div class="pp-header">
		<h1>Past Paper Questions</h1>
		<p>WJEC GCSE Design and Technology – Product Design (Unit 1: 3603U10-1)</p>
	</div>

	<div class="pp-controls">
		<div class="pp-filters">
			<div class="pp-filter-group">
				<label for="filter-paper">Paper</label>
				<select id="filter-paper" bind:value={paper}>
					<option value="all">All papers</option>
					{#each papers as p (p.value)}
						<option value={p.value}>{p.label}</option>
					{/each}
				</select>
			</div>
			<div class="pp-filter-group">
				<label for="filter-topic">Topic</label>
				<select id="filter-topic" bind:value={topic}>
					<option value="all">All topics</option>
					{#each topics as t (t)}
						<option value={t}>{t.replace(/-/g, ' ')}</option>
					{/each}
				</select>
			</div>
			<div class="pp-filter-group">
				<label for="filter-marks">Total Marks</label>
				<select id="filter-marks" bind:value={marks}>
					<option value="all">Any</option>
					<option value="1-10">1–10 marks</option>
					<option value="11-20">11–20 marks</option>
					<option value="21+">21+ marks</option>
				</select>
			</div>
			<div class="pp-filter-group">
				<label for="filter-type">Type</label>
				<select id="filter-type" bind:value={type}>
					<option value="all">All types</option>
					<option value="short-answer">Short answer</option>
					<option value="written">Written</option>
				</select>
			</div>
		</div>
		<div class="pp-actions">
			<button class="pp-btn" onclick={() => visible.forEach((q) => open.add(q.id))}>Show all answers</button>
			<button class="pp-btn" onclick={() => open.clear()}>Hide all answers</button>
		</div>
	</div>

	<div class="pp-count">{visible.length} question{visible.length !== 1 ? 's' : ''}</div>

	<div class="pp-questions" id="pp-questions">
		{#each data.questions as q (q.id)}
			<div class="pp-card" class:open={open.has(q.id)} id={q.id} style:display={visibleIds.has(q.id) ? null : 'none'}>
				<button type="button" class="pp-card-header" aria-expanded={open.has(q.id)} onclick={() => toggle(open, q.id)}>
					<span class="pp-card-meta">
						<span class="pp-badge pp-badge--paper">{q.session} {q.year}</span>
						<span class="pp-badge pp-badge--topic">{q.topic.replace(/-/g, ' ')}</span>
						<span class="pp-badge pp-badge--marks">{q.total_marks}m</span>
						<span class="pp-qnum">Q{q.question_number}</span>
					</span>
					<svg class="pp-chevron" width="14" height="8" viewBox="0 0 14 8" fill="none" aria-hidden="true"
						><path d="M1 1L7 7L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg
					>
				</button>
				<div class="pp-card-body">
					{#if q.images.length > 0}
						<div class="pp-images">
							{#each q.images as img (img)}
								<img src={img} alt="Q{q.question_number} image" class="pp-question-img" />
							{/each}
						</div>
					{/if}

					{#if q.contextHtml}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						<div class="pp-context">{@html q.contextHtml}</div>
					{/if}

					<div class="pp-parts">
						{#each q.parts as part, i (i)}
							{@const key = `${q.id}:${i}`}
							<div class="pp-part">
								<div class="pp-part-q">
									{#if part.label !== ''}<span class="pp-part-label">{part.label}</span>{/if}
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									<div class="pp-part-text">{@html part.questionHtml}</div>
									<span class="pp-part-marks">[{part.marks}]</span>
								</div>
								<div class="pp-part-ms">
									<button class="pp-reveal-btn" aria-expanded={revealed.has(key)} onclick={() => toggle(revealed, key)}>
										{revealed.has(key) ? 'Hide mark scheme' : 'Reveal mark scheme'}
									</button>
									<div class="pp-answer-content" style:display={revealed.has(key) ? null : 'none'}>
											<div class="pp-answer-label">Mark Scheme</div>
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											<div class="pp-answer-text">{@html part.answerHtml}</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>
