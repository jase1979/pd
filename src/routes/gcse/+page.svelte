<script lang="ts">
	import { pageTitle } from '$lib/site';
	import LevelUnits from '$lib/components/LevelUnits.svelte';

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
	<p>Unit 1 is the written exam (2.1.1 and 2.1.2 below). Unit 2 is the NEA (design and make task).</p>
</div>

<LevelUnits units={data.units} />
