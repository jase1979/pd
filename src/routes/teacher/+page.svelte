<script lang="ts">
	// The teacher's groups, the year-end deletion reminder and "create group".
	import { onMount } from 'svelte';
	import { pageTitle } from '$lib/site';
	import TeacherBar from '$lib/components/teacher/TeacherBar.svelte';
	import { SPEC_NAMES, shortDate, teacherApi, type Group } from '$lib/teacher';

	let groups = $state<Group[] | null>(null);
	let name = $state('');
	let spec = $state('gcse-legacy');
	let busy = $state(false);
	let message = $state('');

	const reminders = $derived(groups?.filter((g) => g.needs_deleting) ?? []);
	const active = $derived(groups?.filter((g) => !g.archived) ?? []);
	const archived = $derived(groups?.filter((g) => g.archived) ?? []);

	async function load() {
		groups = (await teacherApi<{ groups: Group[] }>('GET', '/api/teacher/groups')).groups;
	}
	onMount(load);

	async function create(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = '';
		try {
			const g = await teacherApi<Group>('POST', '/api/teacher/groups', { name, spec });
			location.href = `/teacher/group/?id=${g.id}`;
		} catch (e) {
			message = (e as Error).message;
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('Teacher area')}</title>
</svelte:head>

<TeacherBar />

<div class="teacher-page">
	<h1>Your groups</h1>

	{#if reminders.length}
		<section class="teacher-reminder" aria-labelledby="reminder-heading">
			<h2 id="reminder-heading">Time to delete these groups</h2>
			<p>
				Students' data should only be kept until the end of their course. These groups are archived or more than a year
				old. Export anything you need, then delete them.
			</p>
			<ul>
				{#each reminders as g (g.id)}
					<li>
						<strong>{g.name}</strong> — {g.archived ? 'archived' : `created ${shortDate(g.created_at)}`}
						<a href="/teacher/group/?id={g.id}#delete">Export or delete →</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if groups === null}
		<p class="account-intro" aria-live="polite">Loading…</p>
	{:else}
		{#if active.length === 0}
			<p class="account-intro">
				{archived.length ? 'No active groups.' : "No groups yet."} Create one below, then paste in your students' usernames.
			</p>
		{:else}
			<ul class="teacher-groups">
				{#each active as g (g.id)}
					<li>
						<a href="/teacher/group/?id={g.id}" class="teacher-group-name">{g.name}</a>
						<span class="quiz-hint">{g.students} student{g.students === 1 ? '' : 's'} · {SPEC_NAMES[g.spec] ?? g.spec}</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if archived.length}
			<details class="teacher-archived">
				<summary>Archived groups ({archived.length})</summary>
				<ul class="teacher-groups">
					{#each archived as g (g.id)}
						<li><a href="/teacher/group/?id={g.id}" class="teacher-group-name">{g.name}</a> <span class="quiz-hint">{g.students} students</span></li>
					{/each}
				</ul>
			</details>
		{/if}
	{/if}

	<form class="account-form teacher-create" onsubmit={create}>
		<h2>Create a group</h2>
		<label for="group-name">Name</label>
		<input id="group-name" class="account-input" bind:value={name} maxlength="60" placeholder="e.g. 10X Product Design" required />
		<label for="group-spec">Spec</label>
		<select id="group-spec" class="account-input" bind:value={spec}>
			{#each Object.entries(SPEC_NAMES) as [value, label] (value)}
				<option {value}>{label}</option>
			{/each}
		</select>
		{#if message}<p class="quiz-error" role="alert">{message}</p>{/if}
		<button type="submit" class="quiz-btn quiz-btn--primary" disabled={busy}>Create group</button>
	</form>
</div>
