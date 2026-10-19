<script lang="ts">
	import { onMount } from 'svelte';
	import { pageTitle } from '$lib/site';

	let email = $state('');
	let password = $state('');
	let method = $state<'password' | 'link' | null>(null);
	let remember = $state(false);
	let busy = $state(false);
	let message = $state('');
	let sent = $state(false);
	let devLink = $state<string | null>(null);
	let next = '/teacher/';
	const usePassword = $derived(method === 'password');

	onMount(async () => {
		const res = await fetch('/api/teacher/login').catch(() => null);
		method = res?.ok ? ((await res.json()) as { method: 'password' | 'link' }).method : 'link';
		const wanted = new URLSearchParams(location.search).get('next');
		if (wanted && wanted.startsWith('/teacher/') && !wanted.startsWith('//')) next = wanted;
		// Kept for after the link is used (see verify).
		try {
			sessionStorage.setItem('teacher-next', next);
		} catch {
			// Fine without it: they'll land on /teacher/.
		}
	});

	async function send(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = '';
		try {
			const res = await fetch('/api/teacher/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email, remember, ...(method === 'password' && { password }) })
			});
			const data = (await res.json().catch(() => ({}))) as { message?: string; dev_link?: string; signed_in?: boolean };
			if (!res.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
			if (data.signed_in) {
				location.href = next;
				return;
			}
			devLink = data.dev_link ?? null;
			sent = true;
		} catch (e) {
			message = (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('Teacher sign in')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="account-page">
	<h1>Teacher sign in</h1>
	{#if sent}
		<div class="account-form" aria-live="polite">
			<p><strong>Check your email.</strong></p>
			<p>If {email} can sign in, we've sent it a link. It works once, for the next 15 minutes.</p>
			<p class="quiz-hint">Nothing there after a few minutes? Check your junk folder, or <button type="button" class="quiz-link-btn" onclick={() => (sent = false)}>try again</button>.</p>
			{#if devLink}
				<p class="quiz-notice">Local development (no email is sent): <a href={devLink}>use the sign-in link</a></p>
			{/if}
		</div>
	{:else}
		<p class="account-intro">
			{usePassword ? 'Sign in with your email address and password.' : "We'll email you a link to sign in. There's no password."}
			Students log in <a href="/login/">here</a> with their code.
		</p>
		<form class="account-form" onsubmit={send}>
			<label for="teacher-email">School email address</label>
			<input id="teacher-email" class="account-input" type="email" bind:value={email} autocomplete="username" required />
			{#if usePassword}
				<label for="teacher-password">Password</label>
				<input id="teacher-password" class="account-input" type="password" bind:value={password} autocomplete="current-password" required />
			{/if}
			<label class="account-check">
				<input type="checkbox" bind:checked={remember} aria-describedby="teacher-remember-hint" />
				Keep me signed in on this device
			</label>
			<p class="quiz-hint" id="teacher-remember-hint">Leave this unticked on a shared or classroom computer.</p>
			{#if message}<p class="quiz-error" role="alert">{message}</p>{/if}
			<button type="submit" class="quiz-btn quiz-btn--primary" disabled={busy || method === null}>
				{usePassword ? (busy ? 'Signing in…' : 'Sign in') : busy ? 'Sending…' : 'Email me a sign-in link'}
			</button>
		</form>
	{/if}
</div>
