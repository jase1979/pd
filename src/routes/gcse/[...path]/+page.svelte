<script lang="ts">
	import { onMount } from 'svelte';
	import { pageTitle } from '$lib/site';
	import { refreshSession, session } from '$lib/session.svelte';
	import type { ProgressData, TopicProgress } from '$lib/quiz/public';
	import TopicPage from '$lib/components/TopicPage.svelte';

	let { data } = $props();

	// A logged-in student sees their status on each topic card.
	let statuses = $state(new Map<string, TopicProgress>());
	onMount(async () => {
		refreshSession();
		if (data.kind !== 'unit' || !session.username) return;
		const res = await fetch('/api/student/progress').catch(() => null);
		if (!res?.ok) return;
		const progress: ProgressData = await res.json();
		statuses = new Map(progress.topics.map((t) => [t.page, t]));
	});
</script>

<svelte:head>
	<title>{pageTitle(data.kind === 'unit' ? data.unit.label : data.topic.title)}</title>
</svelte:head>

{#if data.kind === 'unit'}
	<div class="breadcrumb">
		<a href="/">Home</a>
		<span class="sep">/</span>
		<a href={data.level?.url}>{data.level?.display}</a>
		<span class="sep">/</span>
		<span>{data.unit.label}</span>
	</div>

	<div class="unit-header">
		<h1>{data.unit.label}</h1>
		<p>{data.unit.description}</p>
	</div>

	<div class="topic-grid">
		{#each data.unit.topics as topic (topic.url)}
			<a href={topic.url} class="topic-card">
				<h3>{topic.title}</h3>
				{#if statuses.get(topic.url)}
					{@const t = statuses.get(topic.url)!}
					<span class="status-badge status-{t.status}">{t.label}</span>
				{/if}
			</a>
		{/each}
	</div>
{:else}
	<TopicPage topic={data.topic} toc={data.toc} prev={data.prev} next={data.next} quizId={data.quizId} />
{/if}
