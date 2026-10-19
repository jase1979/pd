<script lang="ts">
	import { pageTitle } from '$lib/site';
	import Practice from '$lib/components/quiz/Practice.svelte';
</script>

<svelte:head>
	<title>{pageTitle('Exam technique')}</title>
</svelte:head>

<div class="account-page account-page--wide">
	<h1>Exam technique</h1>
	<p class="account-intro">Practise recognising what earns marks, so you can do it in your own answers.</p>
	<Practice modes={['technique']} />
</div>
