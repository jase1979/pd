<script lang="ts">
	// Login slips for a group: A4, 10 cut-out cards per page, each with the
	// site address, the username and the code.
	import { onMount } from 'svelte';
	import { pageTitle } from '$lib/site';
	import { idFromQuery, teacherApi, type Group, type GroupStudent } from '$lib/teacher';

	let group = $state<Group>();
	let students = $state<GroupStudent[]>([]);
	let site = $state('');
	let message = $state('');

	onMount(async () => {
		site = `${location.host}/login/`;
		const id = idFromQuery();
		if (id === null) {
			message = 'Group not found.';
			return;
		}
		try {
			const data = await teacherApi<{ group: Group; students: GroupStudent[] }>('GET', `/api/teacher/groups/${id}`);
			group = data.group;
			students = data.students;
		} catch (e) {
			message = (e as Error).message;
		}
	});
</script>

<svelte:head>
	<title>{pageTitle(group ? `Login slips: ${group.name}` : 'Login slips')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="slips-page">
	<div class="slips-controls">
		{#if group}<a href="/teacher/group/?id={group.id}">← Back to {group.name}</a>{/if}
		<button type="button" class="quiz-btn quiz-btn--primary" onclick={() => window.print()} disabled={!students.length}>Print</button>
		<p class="quiz-hint">10 slips per A4 page. Cut along the dashed lines.</p>
		{#if message}<p class="quiz-error" role="alert">{message}</p>{/if}
	</div>

	<div class="slips">
		{#each students as s (s.id)}
			<div class="slip">
				<p class="slip-site">Log in at <strong>{site}</strong></p>
				<p class="slip-name">{s.username}</p>
				<p class="slip-code">{s.login_code}</p>
				<p class="slip-note">This is your code for the whole course — keep it safe.</p>
			</div>
		{/each}
	</div>
</div>
