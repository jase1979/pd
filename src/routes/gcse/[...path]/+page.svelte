<script lang="ts">
	import { pageTitle } from '$lib/site';
	import TopicPage from '$lib/components/TopicPage.svelte';

	let { data } = $props();
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
			</a>
		{/each}
	</div>
{:else}
	<TopicPage topic={data.topic} toc={data.toc} prev={data.prev} next={data.next} quizId={data.quizId} />
{/if}
