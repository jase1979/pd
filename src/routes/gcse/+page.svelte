<script lang="ts">
	import { pageTitle } from '$lib/site';

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle('GCSE Product Design')}</title>
</svelte:head>

<div class="breadcrumb">
	<a href="/">Home</a>
	<span class="sep">/</span>
	<span>{data.level.display}</span>
</div>

<div class="level-header">
	<h1>{data.level.display} Product Design</h1>
	<p>{data.level.subtitle}</p>
</div>

<div class="units-grid">
	{#each data.units as unit (unit.url)}
		<div class="unit-card">
			<h2><a href={unit.url}>{unit.label}</a></h2>
			<p class="unit-desc">{unit.description}</p>
			<ul class="topic-list">
				{#each unit.topics as topic, i (topic.url)}
					<li><a href={topic.url}>{i + 1}. {topic.title}</a></li>
				{/each}
			</ul>
		</div>
	{/each}
</div>
