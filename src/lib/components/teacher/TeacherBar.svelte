<script lang="ts">
	// The strip at the top of every teacher page: who's signed in, and sign out.
	import { onMount } from 'svelte';
	import { teacherApi } from '$lib/teacher';

	let email = $state<string | null>(null);

	onMount(async () => {
		const me = await teacherApi<{ teacher: { email: string } | null }>('GET', '/api/teacher/me');
		if (!me.teacher) location.href = `/teacher/login/?next=${encodeURIComponent(location.pathname + location.search)}`;
		else email = me.teacher.email;
	});

	async function signOut() {
		await fetch('/api/teacher/logout', { method: 'POST' }).catch(() => {});
		location.href = '/teacher/login/';
	}
</script>

<svelte:head><meta name="robots" content="noindex" /></svelte:head>

<div class="teacher-bar">
	<a href="/teacher/" class="teacher-bar-home">Teacher area</a>
	<a href="/teacher/questions/">Question health</a>
	<a href="/teacher/starter/">Lesson starter</a>
	{#if email}
		<span class="teacher-bar-who">Signed in as <strong>{email}</strong></span>
		<button type="button" class="quiz-link-btn" onclick={signOut}>Sign out</button>
	{/if}
</div>
