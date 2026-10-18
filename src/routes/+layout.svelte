<script lang="ts">
	import '$lib/styles/main.scss';
	import Header from '$lib/components/Header.svelte';

	let { children } = $props();
</script>

<Header />
<main class="container">
	{@render children()}
</main>
<footer>
	<p>WJEC Product Design Revision Guide</p>
</footer>
