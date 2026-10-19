<script lang="ts">
	// Where the emailed link lands. Opening it spends nothing (mail scanners
	// open links too); the teacher has to press the button.
	import { onMount } from 'svelte';
	import { pageTitle } from '$lib/site';

	let token = '';
	let status = $state<'checking' | 'valid' | 'used' | 'expired' | 'unknown'>('checking');
	let email = $state('');
	let busy = $state(false);
	let message = $state('');

	onMount(async () => {
		token = new URLSearchParams(location.search).get('token') ?? '';
		// Take the token out of the address bar and history.
		history.replaceState(history.state, '', location.pathname);
		const res = await fetch(`/api/teacher/verify?token=${encodeURIComponent(token)}`).catch(() => null);
		const data: { status: typeof status; email?: string } = res?.ok ? await res.json() : { status: 'unknown' };
		status = data.status;
		email = data.email ?? '';
	});

	async function signIn() {
		busy = true;
		message = '';
		const res = await fetch('/api/teacher/verify', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token })
		}).catch(() => null);
		if (!res?.ok) {
			const data = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
			message = data?.message ?? 'Something went wrong. Please try again.';
			busy = false;
			return;
		}
		let next = '/teacher/';
		try {
			next = sessionStorage.getItem('teacher-next') ?? next;
			sessionStorage.removeItem('teacher-next');
		} catch {
			// Fine: /teacher/.
		}
		location.href = next;
	}
</script>

<svelte:head>
	<title>{pageTitle('Teacher sign in')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="account-page">
	<h1>Teacher sign in</h1>
	{#if status === 'checking'}
		<p class="account-intro" aria-live="polite">Checking your link…</p>
	{:else if status === 'valid'}
		<div class="account-form">
			<p>Sign in as <strong>{email}</strong>?</p>
			{#if message}<p class="quiz-error" role="alert">{message}</p>{/if}
			<button type="button" class="quiz-btn quiz-btn--primary" onclick={signIn} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
		</div>
	{:else}
		<p class="quiz-notice">
			{status === 'used'
				? 'This link has already been used.'
				: status === 'expired'
					? 'This link has expired: they only work for 15 minutes.'
					: "This link isn't valid."}
		</p>
		<a class="quiz-btn quiz-btn--primary" href="/teacher/login/">Get a new link</a>
	{/if}
</div>
