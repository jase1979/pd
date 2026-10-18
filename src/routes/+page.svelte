<script lang="ts">
	import { pageTitle } from '$lib/site';

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle('Home')}</title>
</svelte:head>

<div class="hero">
	<h1>WJEC Product Design</h1>
	<p>GCSE Product Design revision topics</p>
</div>

<div class="level-cards">
	{#each data.levels as level (level.id)}
		<div class="level-card">
			<span class="level-tag {level.id}">{level.tag}</span>
			<h2>{level.display} Product Design</h2>
			<p>{level.home_desc}</p>
			<ul class="unit-list">
				{#each level.units as unit (unit.url)}
					<li><a href={unit.url}>{unit.label}</a></li>
				{/each}
			</ul>
		</div>
	{/each}
</div>
