<script lang="ts">
	// A level's units, each with its topics (the Jekyll level-units include).
	import type { Unit } from '$lib/server/site';

	let { units }: { units: Unit[] } = $props();
</script>

<div class="units-grid">
	{#each units as unit (unit.url)}
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
