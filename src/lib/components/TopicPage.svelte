<script lang="ts">
	import { onMount } from 'svelte';
	import type { Heading } from '$lib/server/markdown';
	import Quiz from './quiz/Quiz.svelte';

	interface Topic {
		title: string;
		level: string;
		level_url: string;
		unit_name: string;
		unit_url: string;
		html: string;
	}
	interface NavLink {
		url: string;
		title: string;
	}

	let {
		topic,
		toc,
		prev,
		next,
		quizId = null
	}: {
		topic: Topic;
		toc: Heading[];
		prev: NavLink | null;
		next: NavLink | null;
		quizId?: string | null;
	} = $props();

	// With fewer than two sections the contents list isn't worth showing.
	const showToc = $derived(toc.length >= 2);
	let tocOpen = $state(false);
	let activeId = $state('');
	let content = $state<HTMLElement>();

	function jumpTo(event: MouseEvent, id: string) {
		const target = document.getElementById(id);
		if (!target) return;
		event.preventDefault();
		target.scrollIntoView({ behavior: 'smooth', block: 'start' });
		history.replaceState(history.state, '', '#' + id);
		tocOpen = false;
	}

	// Highlight the section currently at the top of the screen.
	onMount(() => {
		if (!showToc) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) activeId = entry.target.id;
				}
			},
			{ rootMargin: '-80px 0px -70% 0px', threshold: 0 }
		);
		content?.querySelectorAll('h2[id]').forEach((h) => observer.observe(h));
		return () => observer.disconnect();
	});
</script>

<div class="topic-page">
	<div class="breadcrumb">
		<a href="/">Home</a>
		<span class="sep">/</span>
		<a href={topic.level_url}>{topic.level}</a>
		<span class="sep">/</span>
		<a href={topic.unit_url}>{topic.unit_name}</a>
		<span class="sep">/</span>
		<span>{topic.title}</span>
	</div>

	<div class="topic-header">
		<h1>{topic.title}</h1>
		<p>{topic.level} — {topic.unit_name}</p>
	</div>

	{#if topic.html.trim() === ''}
		<div class="content-placeholder">
			<h2>Content Coming Soon</h2>
			<p>Detailed revision notes for each section above will be added here.</p>
		</div>
	{:else}
		<div class="topic-layout" class:no-toc={!showToc}>
			{#if showToc}
				<nav class="toc" aria-label="On this page">
					<div class="toc-sticky">
						<button
							type="button"
							class="toc-toggle"
							aria-expanded={tocOpen}
							aria-controls="toc-list"
							onclick={() => (tocOpen = !tocOpen)}
						>
							<span>On this page</span>
							<svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true"
								><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg
							>
						</button>
						<ul class="toc-list" class:open={tocOpen} id="toc-list">
							{#each toc as heading (heading.id)}
								<li>
									<a
										href="#{heading.id}"
										class:active={activeId === heading.id}
										onclick={(e) => jumpTo(e, heading.id)}>{heading.text}</a
									>
								</li>
							{/each}
						</ul>
					</div>
				</nav>
			{/if}
			<div class="topic-content" bind:this={content}>
				<!-- Rendered from the Markdown in content/ at build time. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html topic.html}
			</div>
		</div>
	{/if}

	{#if quizId}
		<Quiz id={quizId} />
	{/if}

	<div class="nav-links">
		{#if prev}
			<a href={prev.url}>&larr; {prev.title}</a>
		{:else}
			<span></span>
		{/if}
		{#if next}
			<a href={next.url}>{next.title} &rarr;</a>
		{/if}
	</div>
</div>
