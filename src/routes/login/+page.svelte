<script lang="ts">
	import { onMount } from 'svelte';
	import { pageTitle } from '$lib/site';
	import { refreshSession, session } from '$lib/session.svelte';

	let code = $state('');
	let remember = $state(false);
	let busy = $state(false);
	let message = $state('');
	let next = $state('/progress/');

	onMount(() => {
		refreshSession();
		// Back to where the student came from, if it's a page on this site.
		const wanted = new URLSearchParams(location.search).get('next');
		if (wanted && wanted.startsWith('/') && !wanted.startsWith('//')) next = wanted;
	});

	async function login(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = '';
		try {
			const res = await fetch('/api/student/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code, remember })
			});
			const data = (await res.json().catch(() => ({}))) as { message?: string };
			if (!res.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
			location.href = next;
		} catch (e) {
			message = (e as Error).message;
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('Log in')}</title>
</svelte:head>

<div class="account-page">
	<h1>Log in</h1>
	{#if session.username}
		<p class="quiz-notice">You're logged in as <strong>{session.username}</strong>. <a href="/progress/">See your progress</a>.</p>
	{/if}
	<p class="account-intro">Type the code your teacher gave you. You don't need a username or password.</p>

	<form class="account-form" onsubmit={login}>
		<label for="login-code">Your code</label>
		<input
			id="login-code"
			class="login-code"
			bind:value={code}
			placeholder="XXXX-XXXX"
			autocomplete="off"
			autocapitalize="characters"
			spellcheck="false"
			maxlength="12"
			required
			aria-describedby="login-code-hint{message ? ' login-error' : ''}"
		/>
		<p class="quiz-hint" id="login-code-hint">Capitals don't matter, and you can leave out the dash.</p>

		<label class="account-check">
			<input type="checkbox" bind:checked={remember} aria-describedby="remember-hint" />
			Remember me on this device
		</label>
		<p class="quiz-hint" id="remember-hint">Only tick this on your own device.</p>

		{#if message}<p class="quiz-error" id="login-error" role="alert">{message}</p>{/if}

		<button type="submit" class="quiz-btn quiz-btn--primary" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
	</form>

	<p class="quiz-hint account-privacy">
		We store your username and your quiz answers so you and your teachers can see your progress.
		<a href="/privacy/">How we use your information</a>
	</p>
</div>
