<script lang="ts">
	import { pageTitle } from '$lib/site';

	let { data } = $props();

	let query = $state('');
	const q = $derived(query.toLowerCase().trim());

	function matches(entry: { term: string; definitionHtml: string }): boolean {
		if (!q) return true;
		const definition = entry.definitionHtml.replace(/<[^>]+>/g, '').toLowerCase();
		return entry.term.toLowerCase().includes(q) || definition.includes(q);
	}

	const visibleCount = $derived(data.sections.reduce((n, s) => n + s.entries.filter(matches).length, 0));
</script>

<svelte:head>
	<title>{pageTitle('Glossary')}</title>
</svelte:head>

<div class="glossary-page">
	<h1>Glossary</h1>
	<p class="glossary-subtitle">Key terms for GCSE Product Design.</p>

	<div class="glossary-controls">
		<input
			type="text"
			class="glossary-search"
			placeholder="Search terms…"
			aria-label="Search terms"
			autocomplete="off"
			bind:value={query}
		/>
		<div class="glossary-alpha-bar">
			{#each data.letters as { letter, present } (letter)}
				{#if present}
					<a href="#letter-{letter}" class="alpha-link">{letter}</a>
				{:else}
					<span class="alpha-link empty">{letter}</span>
				{/if}
			{/each}
		</div>
	</div>

	<div id="glossary-list">
		{#each data.sections as section (section.letter)}
			<div class="glossary-section" id="letter-{section.letter}" style:display={section.entries.some(matches) ? null : 'none'}>
				<h2 class="glossary-letter">{section.letter}</h2>
				{#each section.entries as entry (entry.slug)}
					<div class="glossary-entry" id="term-{entry.slug}" style:display={matches(entry) ? null : 'none'}>
						<div class="glossary-term-row">
							<strong class="glossary-term-name">{entry.term}</strong>
							<span class="glossary-badge glossary-badge--{entry.level.toLowerCase()}">{entry.level}</span>
						</div>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						<p class="glossary-definition">{@html entry.definitionHtml}</p>
						<a href={entry.source} class="glossary-source-link">View topic →</a>
					</div>
				{/each}
			</div>
		{/each}
	</div>

	{#if visibleCount === 0}
		<p class="glossary-no-results">No matching terms found.</p>
	{/if}
</div>
