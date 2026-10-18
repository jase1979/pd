<script lang="ts">
	import { page } from '$app/state';
	import { pageTitle } from '$lib/site';
</script>

<svelte:head>
	<title>{pageTitle(page.status === 404 ? 'Page not found' : 'Error')}</title>
</svelte:head>

<div class="content-placeholder">
	<h1>{page.status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
	<p><a href="/">Back to the home page</a></p>
</div>
