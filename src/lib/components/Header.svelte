<script lang="ts">
	import { logOut, session } from '$lib/session.svelte';
</script>

<header class="site-header">
	<div class="header-inner">
		<a href="/" class="site-title">WJEC Product Design</a>
		<nav>
			<a href="/gcse/" class="gcse">GCSE</a>
			<a href="/past-papers/" class="past-papers">Past Papers</a>
			<a href="/glossary/" class="glossary">Glossary</a>
			{#if session.username}
				<a href="/progress/" class="progress">My progress</a>
			{/if}
		</nav>
		<div class="account" class:hidden={!session.checked}>
			{#if session.username}
				<span class="account-name">{session.username}</span>
				<button type="button" class="account-logout" onclick={logOut}>Not you? Log out</button>
			{:else}
				<a href="/login/" class="account-login">Log in</a>
			{/if}
		</div>
	</div>
</header>
