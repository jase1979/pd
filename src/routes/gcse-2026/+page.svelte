<script lang="ts">
	import { pageTitle } from '$lib/site';
	import LevelUnits from '$lib/components/LevelUnits.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle('D&T 2026 — Product Design')}</title>
</svelte:head>

<div class="breadcrumb">
	<a href="/">Home</a>
	<span class="sep">/</span>
	<span>{data.level.display}</span>
</div>

<div class="level-header">
	<h1>GCSE Design &amp; Technology — Product Design</h1>
	<p>{data.level.subtitle}</p>
</div>

<div class="topic-content">
	<p>
		This is the <strong>new WJEC specification</strong>, first taught from September 2026 with the first award in 2028. It is a
		different qualification from the one covered in the <a href="/gcse/">legacy GCSE section</a> — the units, weightings and
		assessment have all changed, so the two are kept separate.
	</p>
	<p>
		Learners choose one of three pathways — Engineering Design, Fashion &amp; Textiles or Product Design — and must use the
		<strong>same pathway in both units</strong>. These pages cover the <strong>Product Design</strong> pathway, plus the core
		content that every learner studies whichever pathway they take.
	</p>
	<p>
		<a href="/gcse-2026/assessment/">How the qualification is assessed →</a>
	</p>
</div>

<LevelUnits units={data.units} />
