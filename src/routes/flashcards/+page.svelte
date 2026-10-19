<script lang="ts">
	// Flashcards: pick a topic (or a whole level), flip each card, and mark it
	// "Know it" or "Still learning". What you know is remembered in this
	// browser only (localStorage "fc_known", the same key the Jekyll page used).
	import { onMount } from 'svelte';
	import { pageTitle } from '$lib/site';

	let { data } = $props();

	type Card = { id: string; front: string; back: string };

	let choice = $state('');
	let deck = $state<Card[]>([]);
	let index = $state(0);
	let flipped = $state(false);
	let known = $state(new Set<string>());
	let confirmingReset = $state(false);

	const card = $derived(deck[index]);
	const knownCount = $derived(deck.filter((c) => known.has(c.id)).length);
	const pct = $derived(deck.length ? Math.round((knownCount / deck.length) * 100) : 0);

	function cardsFor(value: string): Card[] {
		if (value.startsWith('__level__')) {
			const level = data.levels.find((l) => l.id === value.slice(9));
			return level ? level.units.flatMap((u) => u.topics.flatMap((t) => data.decks[t.key] ?? [])) : [];
		}
		return data.decks[value] ?? [];
	}

	function load(value: string) {
		choice = value;
		deck = cardsFor(value).slice();
		index = 0;
		flipped = false;
	}

	onMount(() => {
		try {
			known = new Set(JSON.parse(localStorage.getItem('fc_known') || '[]'));
		} catch {
			// Not remembered: fine.
		}
		if (data.levels[0]) load(`__level__${data.levels[0].id}`);
	});

	function save() {
		try {
			localStorage.setItem('fc_known', JSON.stringify([...known]));
		} catch {
			// Not remembered: fine.
		}
	}

	function go(step: number) {
		const next = index + step;
		if (next < 0 || next >= deck.length) return;
		index = next;
		flipped = false;
	}

	function mark(isKnown: boolean) {
		if (!card) return;
		const next = new Set(known);
		if (isKnown) next.add(card.id);
		else next.delete(card.id);
		known = next;
		save();
		if (index < deck.length - 1) setTimeout(() => go(1), 350);
	}

	function shuffle() {
		const d = deck.slice();
		for (let i = d.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[d[i], d[j]] = [d[j], d[i]];
		}
		deck = d;
		index = 0;
		flipped = false;
	}

	function reset() {
		known = new Set();
		save();
		confirmingReset = false;
	}

	function onCardKey(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			if (card) flipped = !flipped;
		}
		if (event.key === 'ArrowRight') go(1);
		if (event.key === 'ArrowLeft') go(-1);
	}
</script>

<svelte:head>
	<title>{pageTitle('Flashcards')}</title>
</svelte:head>

<div class="fc-page">
	<div class="fc-header">
		<h1>Flashcards</h1>
		<div class="fc-top-controls">
			<select class="fc-topic-select" aria-label="Select topic" value={choice} onchange={(e) => load(e.currentTarget.value)}>
				{#each data.levels as level (level.id)}
					<optgroup label={level.display}>
						<option value="__level__{level.id}">All {level.display}</option>
						{#each level.units as unit (unit.label)}
							<option disabled>— {unit.label}</option>
							{#each unit.topics as t (t.key)}
								<option value={t.key}>{t.label} ({data.decks[t.key].length})</option>
							{/each}
						{/each}
					</optgroup>
				{/each}
			</select>
			<button type="button" class="fc-btn" onclick={shuffle}>⇄ Shuffle</button>
			{#if confirmingReset}
				<span class="fc-confirm">Forget every card you've marked as known?</span>
				<button type="button" class="fc-btn" onclick={reset}>Yes, reset</button>
				<button type="button" class="fc-btn" onclick={() => (confirmingReset = false)}>Cancel</button>
			{:else}
				<button type="button" class="fc-btn" onclick={() => (confirmingReset = true)}>↺ Reset</button>
			{/if}
		</div>
	</div>

	<div class="fc-progress-wrap">
		<div class="fc-progress-bar"><div class="fc-progress-fill" style="width: {pct}%"></div></div>
		<span class="fc-progress-label">{knownCount} / {deck.length} known</span>
	</div>

	<div class="fc-arena">
		<div
			class="fc-card"
			class:flipped
			role="button"
			tabindex="0"
			aria-label={flipped ? 'Flashcard, showing the definition. Press to show the term' : 'Flashcard, showing the term. Press to reveal the definition'}
			onclick={() => card && (flipped = !flipped)}
			onkeydown={onCardKey}
		>
			<div class="fc-card-inner">
				<div class="fc-front" aria-hidden={flipped}>
					<span class="fc-side-label">Term</span>
					<span class="fc-term">{card ? card.front : deck.length === 0 && choice ? 'No cards available for this topic.' : 'Select a topic to begin'}</span>
				</div>
				<div class="fc-back" aria-hidden={!flipped}>
					<span class="fc-side-label">Definition</span>
					<p class="fc-definition">{card?.back ?? ''}</p>
				</div>
			</div>
		</div>
	</div>

	<p class="fc-hint" aria-live="polite">{flipped ? 'Know it? Use the buttons below' : 'Click the card to reveal the definition'}</p>

	<div class="fc-nav">
		<button type="button" class="fc-nav-btn" onclick={() => go(-1)} disabled={index === 0 || !deck.length}>← Prev</button>
		<div class="fc-action-btns">
			<button type="button" class="fc-known-btn" class:active={card && known.has(card.id)} onclick={() => mark(true)}>✓ Know it</button>
			<button type="button" class="fc-unknown-btn" onclick={() => mark(false)}>✗ Still learning</button>
		</div>
		<button type="button" class="fc-nav-btn" onclick={() => go(1)} disabled={index >= deck.length - 1}>Next →</button>
	</div>

	<p class="fc-counter">Card {deck.length ? index + 1 : '—'} of {deck.length || '—'}</p>
</div>
