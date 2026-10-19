<script lang="ts">
	import { pageTitle } from '$lib/site';
	import Practice from '$lib/components/quiz/Practice.svelte';
</script>

<svelte:head>
	<title>{pageTitle('Review')}</title>
</svelte:head>

<div class="account-page account-page--wide">
	<h1>Review and practice</h1>
	<p class="account-intro">Come back to topics you've already studied. Spacing practice out and mixing topics together helps it stick.</p>
	<Practice modes={['mixed', 'timed', 'mistakes']} />
</div>
