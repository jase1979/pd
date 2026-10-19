<script lang="ts">
	import '$lib/styles/main.scss';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import Header from '$lib/components/Header.svelte';
	import { refreshSession, trackPageView } from '$lib/session.svelte';

	let { children } = $props();

	onMount(refreshSession);
	// Counts notes-page views for a logged-in student (nothing is sent otherwise).
	afterNavigate(({ to }) => {
		refreshSession();
		if (to?.url) trackPageView(to.url.pathname);
	});
</script>

<Header />
<main class="container">
	{@render children()}
</main>
<footer>
	<p>WJEC Product Design Revision Guide · <a href="/privacy/">Privacy</a></p>
</footer>
