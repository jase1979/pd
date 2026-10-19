<script lang="ts">
	// One group: its settings, students (codes hidden until shown), adding
	// students from a pasted list, exports, and deleting the group.
	// Confirmations are inline two-step buttons rather than pop-up dialogs.
	import { onMount, tick } from 'svelte';
	import { pageTitle } from '$lib/site';
	import TeacherBar from '$lib/components/teacher/TeacherBar.svelte';
	import Heatmap from '$lib/components/teacher/Heatmap.svelte';
	import GroupSummary from '$lib/components/teacher/GroupSummary.svelte';
	import QuestionTable from '$lib/components/teacher/QuestionTable.svelte';
	import type { GroupSummary as Summary, Heatmap as HeatmapData, HeatmapBy, QuestionStat } from '$lib/server/analysis';
	import type { TeacherAssignment } from '$lib/server/assignments';
	import type { GroupTeacher } from '$lib/server/groups';
	import { dueLabel, type QuizSummary } from '$lib/quiz/public';
	import { SPEC_NAMES, idFromQuery, shortDate, teacherApi, type Group, type GroupStudent } from '$lib/teacher';

	interface Preview {
		create: string[];
		skip: { username: string; reason: string }[];
	}

	let id = $state<number | null>(null);
	let group = $state<Group>();
	let students = $state<GroupStudent[]>([]);
	let otherGroups = $state<{ id: number; name: string }[]>([]);
	let loadError = $state('');
	let notice = $state('');

	// Settings
	let editName = $state('');
	let editSpec = $state('gcse-legacy');
	let editCooldown = $state(0);
	let settingsMessage = $state('');

	// Codes and per-student actions
	let shown = $state(new Set<number>());
	let showAll = $state(false);
	let confirming = $state<{ kind: 'reset' | 'remove'; id: number } | null>(null);
	let moveTo = $state<Record<number, string>>({});
	let rowMessage = $state<Record<number, string>>({});

	// Adding students
	let pasted = $state('');
	let preview = $state<Preview | null>(null);
	let created = $state<{ username: string; code: string }[]>([]);
	let addMessage = $state('');
	let busy = $state(false);

	// Deleting the group
	let typedName = $state('');
	let deleteMessage = $state('');

	// Set work
	let work = $state<TeacherAssignment[] | null>(null);
	let topicChoices = $state<QuizSummary[]>([]);
	const inAWeek = () => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
	const today = () => new Date().toISOString().slice(0, 10);
	let workKind = $state<'topic' | 'mixed'>('topic');
	let workQuiz = $state('');
	let workTopics = $state<string[]>([]);
	let workDue = $state(inAWeek());
	let workAssessment = $state(false);
	let workMessage = $state('');
	let weakDue = $state(inAWeek());
	let weakAssessment = $state(false);
	let weakMessage = $state('');
	let deletingWork = $state<number | null>(null);

	async function loadWork() {
		const [w, q] = await Promise.all([
			teacherApi<{ assignments: TeacherAssignment[] }>('GET', `/api/teacher/groups/${id}/assignments`),
			topicChoices.length ? Promise.resolve(topicChoices) : fetch('/api/quizzes').then((r): Promise<QuizSummary[]> => (r.ok ? r.json() : Promise.resolve([])))
		]);
		work = w.assignments;
		topicChoices = q.filter((x) => x.available);
		if (!workQuiz && topicChoices[0]) workQuiz = topicChoices[0].id;
	}

	async function setWork(body: Record<string, unknown>, onError: (m: string) => void) {
		try {
			await teacherApi('POST', `/api/teacher/groups/${id}/assignments`, body);
			await loadWork();
			flash('Work set. Students will see it on their progress page.');
			return true;
		} catch (e) {
			onError((e as Error).message);
			return false;
		}
	}

	async function setChosenWork(event: SubmitEvent) {
		event.preventDefault();
		workMessage = '';
		await setWork(
			{ kind: workKind, due_date: workDue, assessment: workAssessment, ...(workKind === 'topic' ? { quiz_id: workQuiz } : { topics: workTopics }) },
			(m) => (workMessage = m)
		);
	}

	async function setWeakReview() {
		weakMessage = '';
		await setWork({ kind: 'weak_spec_points', due_date: weakDue, assessment: weakAssessment }, (m) => (weakMessage = m));
	}

	async function deleteWork(a: TeacherAssignment) {
		deletingWork = null;
		await teacherApi('DELETE', `/api/teacher/assignments/${a.id}`);
		await loadWork();
		flash(`"${a.title}" removed. Students' answers are kept.`);
	}

	// Sharing
	let teachers = $state<GroupTeacher[]>([]);
	let shareEmail = $state('');
	let shareMessage = $state('');

	async function loadTeachers() {
		teachers = (await teacherApi<{ teachers: GroupTeacher[] }>('GET', `/api/teacher/groups/${id}/teachers`)).teachers;
	}

	async function share(event: SubmitEvent) {
		event.preventDefault();
		shareMessage = '';
		try {
			const r = await teacherApi<{ teachers: GroupTeacher[]; can_sign_in: boolean }>('POST', `/api/teacher/groups/${id}/teachers`, { email: shareEmail });
			teachers = r.teachers;
			shareMessage = r.can_sign_in
				? `Shared with ${shareEmail}.`
				: `Shared with ${shareEmail}, but they can't sign in yet: add them to TEACHER_EMAILS first.`;
			shareEmail = '';
		} catch (e) {
			shareMessage = (e as Error).message;
		}
	}

	async function unshare(t: GroupTeacher) {
		await teacherApi('DELETE', `/api/teacher/groups/${id}/teachers/${t.id}`);
		await loadTeachers();
	}

	// Analysis
	type Tab = 'progress' | 'questions' | 'work' | 'students' | 'settings';
	let tab = $state<Tab>('progress');
	let by = $state<HeatmapBy>('topic');
	let progress = $state<{ heatmap: HeatmapData; summary: Summary } | null>(null);
	let questionStats = $state<QuestionStat[] | null>(null);

	async function loadProgress() {
		progress = null;
		progress = await teacherApi('GET', `/api/teacher/groups/${id}/progress?by=${by}`);
	}

	async function show(t: Tab) {
		tab = t;
		history.replaceState(history.state, '', `?id=${id}#${t}`);
		if (t === 'progress' && !progress) await loadProgress();
		if (t === 'questions' && !questionStats) questionStats = (await teacherApi<{ questions: QuestionStat[] }>('GET', `/api/teacher/groups/${id}/questions`)).questions;
		if (t === 'work' && !work) await loadWork();
		if (t === 'settings' && !teachers.length) await loadTeachers();
	}

	async function switchBy(next: HeatmapBy) {
		by = next;
		await loadProgress();
	}

	async function load() {
		if (id === null) return;
		try {
			const data = await teacherApi<{ group: Group; students: GroupStudent[]; other_groups: { id: number; name: string }[] }>(
				'GET',
				`/api/teacher/groups/${id}`
			);
			group = data.group;
			students = data.students;
			otherGroups = data.other_groups;
			editName = group.name;
			editSpec = group.spec;
			editCooldown = group.retry_cooldown_hours;
		} catch (e) {
			loadError = (e as Error).message;
		}
	}

	onMount(async () => {
		id = idFromQuery();
		if (id === null) loadError = 'Group not found.';
		await load();
		const wanted = location.hash.slice(1) as Tab;
		const start: Tab = ['progress', 'questions', 'work', 'students', 'settings'].includes(wanted) ? wanted : students.length ? 'progress' : 'students';
		await show(start);
	});

	function flash(text: string) {
		notice = text;
		setTimeout(() => notice === text && (notice = ''), 5000);
	}

	async function saveSettings(event: SubmitEvent) {
		event.preventDefault();
		settingsMessage = '';
		try {
			group = { ...group!, ...(await teacherApi<Group>('PATCH', `/api/teacher/groups/${id}`, { name: editName, spec: editSpec, retry_cooldown_hours: editCooldown })) };
			flash('Settings saved.');
		} catch (e) {
			settingsMessage = (e as Error).message;
		}
	}

	async function setArchived(archived: boolean) {
		await teacherApi('PATCH', `/api/teacher/groups/${id}`, { archived });
		await load();
		flash(archived ? 'Group archived. Its students can still log in until you delete it.' : 'Group restored.');
	}

	const codeShown = (s: GroupStudent) => showAll || shown.has(s.id);
	function toggleCode(s: GroupStudent) {
		const next = new Set(shown);
		if (next.has(s.id)) next.delete(s.id);
		else next.add(s.id);
		shown = next;
	}

	async function resetCode(s: GroupStudent) {
		confirming = null;
		const r = await teacherApi<{ code: string }>('POST', `/api/teacher/students/${s.id}/reset-code`);
		students = students.map((x) => (x.id === s.id ? { ...x, login_code: r.code } : x));
		shown = new Set([...shown, s.id]);
		rowMessage = { ...rowMessage, [s.id]: 'New code. The old one no longer works, and they have been logged out.' };
	}

	async function removeStudent(s: GroupStudent) {
		confirming = null;
		await teacherApi('DELETE', `/api/teacher/students/${s.id}`);
		await load();
		flash(`${s.username} removed, with all their answers.`);
	}

	async function moveStudent(s: GroupStudent) {
		const target = Number(moveTo[s.id]);
		if (!target) return;
		try {
			await teacherApi('PATCH', `/api/teacher/students/${s.id}`, { group_id: target });
			await load();
			flash(`${s.username} moved to ${otherGroups.find((g) => g.id === target)?.name}. Their code and history moved with them.`);
		} catch (e) {
			rowMessage = { ...rowMessage, [s.id]: (e as Error).message };
		}
	}

	async function readFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (file) pasted = await file.text();
	}

	async function previewPaste() {
		addMessage = '';
		created = [];
		busy = true;
		try {
			preview = await teacherApi<Preview>('POST', `/api/teacher/groups/${id}/students/preview`, { text: pasted });
		} catch (e) {
			addMessage = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function confirmAdd() {
		if (!preview) return;
		busy = true;
		try {
			const r = await teacherApi<{ created: { username: string; code: string }[] }>('POST', `/api/teacher/groups/${id}/students/bulk`, {
				usernames: preview.create
			});
			created = r.created;
			preview = null;
			pasted = '';
			await load();
			await tick();
			document.getElementById('created-heading')?.focus();
		} catch (e) {
			addMessage = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function deleteGroup() {
		deleteMessage = '';
		try {
			await teacherApi('DELETE', `/api/teacher/groups/${id}`, { confirm_name: typedName });
			location.href = '/teacher/';
		} catch (e) {
			deleteMessage = (e as Error).message;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle(group ? `${group.name} (teacher)` : 'Group')}</title>
</svelte:head>

<TeacherBar />

<div class="teacher-page">
	<p class="breadcrumb"><a href="/teacher/">Your groups</a> <span class="sep">/</span> {group?.name ?? ''}</p>

	{#if loadError}
		<p class="quiz-error" role="alert">{loadError}</p>
	{:else if !group}
		<p class="account-intro" aria-live="polite">Loading…</p>
	{:else}
		<h1>{group.name}</h1>
		<p class="account-intro">
			{students.length} student{students.length === 1 ? '' : 's'} · {SPEC_NAMES[group.spec] ?? group.spec} · created {shortDate(group.created_at)}
			{#if group.archived}<span class="status-badge status-not_started">Archived</span>{/if}
		</p>
		{#if notice}<p class="quiz-notice" role="status">{notice}</p>{/if}
		{#if group.needs_deleting}
			<p class="quiz-notice">
				{group.archived ? 'This group is archived.' : 'This group is more than a year old.'} Students' data should only be kept until the
				end of their course: <button type="button" class="quiz-link-btn" onclick={() => show('settings')}>export and delete it</button> when you're done.
			</p>
		{/if}

		<div class="practice-tabs" role="group" aria-label="Group pages">
			{#each [['progress', 'Progress'], ['questions', 'Questions'], ['work', 'Set work'], ['students', 'Students and codes'], ['settings', 'Settings']] as [key, label] (key)}
				<button type="button" class="practice-tab" class:active={tab === key} aria-pressed={tab === key} onclick={() => show(key as Tab)}>{label}</button>
			{/each}
			<a class="practice-tab" href="/teacher/starter/?group={group.id}">Lesson starter</a>
		</div>

		{#if tab === 'progress'}
			<section class="teacher-section" aria-labelledby="progress-heading">
				<div class="teacher-section-head">
					<h2 id="progress-heading">Progress</h2>
					<a class="quiz-btn" href="/api/teacher/groups/{group.id}/export.csv" download>Download markbook (CSV)</a>
				</div>
				<div class="practice-source" role="group" aria-label="Show progress by">
					{#each [['topic', 'Topics'], ['spec_point', 'Spec points'], ['command', 'Command words']] as [key, label] (key)}
						<button type="button" class="quiz-chip" class:selected={by === key} aria-pressed={by === key} onclick={() => switchBy(key as HeatmapBy)}>{label}</button>
					{/each}
				</div>
				{#if progress}<Heatmap data={progress.heatmap} />{:else}<p class="account-intro" aria-live="polite">Loading…</p>{/if}
			</section>
			{#if progress}
				<section class="teacher-section" aria-labelledby="summary-heading">
					<h2 id="summary-heading">Summary</h2>
					<GroupSummary summary={progress.summary} />
				</section>
			{/if}
		{:else if tab === 'questions'}
			<section class="teacher-section" aria-labelledby="questions-heading">
				<div class="teacher-section-head">
					<h2 id="questions-heading">Questions</h2>
					<a class="quiz-btn" href="/teacher/questions/">Question health (all groups)</a>
				</div>
				{#if questionStats}<QuestionTable questions={questionStats} />{:else}<p class="account-intro" aria-live="polite">Loading…</p>{/if}
			</section>
		{:else if tab === 'work'}
			<section class="teacher-section" aria-labelledby="weak-heading">
				<h2 id="weak-heading">Review this group's weakest spec points</h2>
				<p class="account-intro">One click: a mixed quiz on the three spec points the group is weakest on right now. They're fixed when you set it.</p>
				<div class="work-form">
					<label for="weak-due">Due</label>
					<input id="weak-due" class="account-input work-date" type="date" min={today()} bind:value={weakDue} />
					<label class="account-check"><input type="checkbox" bind:checked={weakAssessment} /> Assessment (one go, no "Try again")</label>
					<button type="button" class="quiz-btn quiz-btn--primary" onclick={setWeakReview}>Set the review</button>
				</div>
				{#if weakMessage}<p class="quiz-error" role="alert">{weakMessage}</p>{/if}
			</section>

			<section class="teacher-section" aria-labelledby="setwork-heading">
				<h2 id="setwork-heading">Set a quiz</h2>
				<form onsubmit={setChosenWork}>
					<div class="practice-source" role="radiogroup" aria-label="Kind of quiz">
						<label class="quiz-chip" class:selected={workKind === 'topic'}><input type="radio" name="work-kind" checked={workKind === 'topic'} onchange={() => (workKind = 'topic')} /> One topic</label>
						<label class="quiz-chip" class:selected={workKind === 'mixed'}><input type="radio" name="work-kind" checked={workKind === 'mixed'} onchange={() => (workKind = 'mixed')} /> Mixed topics</label>
					</div>
					{#if workKind === 'topic'}
						<label for="work-quiz">Topic</label>
						<select id="work-quiz" class="account-input" bind:value={workQuiz}>
							{#each topicChoices as t (t.id)}<option value={t.id}>{t.title}</option>{/each}
						</select>
					{:else}
						<fieldset class="practice-topics">
							<legend>Topics</legend>
							{#each topicChoices as t (t.id)}
								<label class="quiz-option" class:selected={workTopics.includes(t.id)}>
									<input type="checkbox" checked={workTopics.includes(t.id)} onchange={() => (workTopics = workTopics.includes(t.id) ? workTopics.filter((x) => x !== t.id) : [...workTopics, t.id])} />
									<span>{t.title}</span>
								</label>
							{/each}
						</fieldset>
					{/if}
					<div class="work-form">
						<label for="work-due">Due</label>
						<input id="work-due" class="account-input work-date" type="date" min={today()} bind:value={workDue} required />
						<label class="account-check"><input type="checkbox" bind:checked={workAssessment} /> Assessment (one go, no "Try again")</label>
						<button type="submit" class="quiz-btn quiz-btn--primary" disabled={workKind === 'mixed' && workTopics.length === 0}>Set work</button>
					</div>
					{#if workMessage}<p class="quiz-error" role="alert">{workMessage}</p>{/if}
				</form>
			</section>

			<section class="teacher-section" aria-labelledby="work-list-heading">
				<h2 id="work-list-heading">Work set</h2>
				{#if work === null}
					<p class="account-intro" aria-live="polite">Loading…</p>
				{:else if work.length === 0}
					<p class="account-intro">Nothing set yet.</p>
				{:else}
					{#each work as a (a.id)}
						<details class="work-item">
							<summary>
								<strong>{a.title}</strong>
								<span class="quiz-hint">due {dueLabel(a.due_date)}{a.assessment ? ' · assessment' : ''}</span>
								<span class="work-count">{a.done} of {a.students.length} done</span>
							</summary>
							<table class="teacher-table">
								<thead><tr><th scope="col">Student</th><th scope="col">Status</th><th scope="col">Best score</th><th scope="col">Attempts</th></tr></thead>
								<tbody>
									{#each a.students as s (s.id)}
										<tr>
											<td><a href="/teacher/student/?id={s.id}">{s.username}</a></td>
											<td><span class="status-badge work-{s.status}">{s.label}</span></td>
											<td>{s.best === null ? '—' : `${Math.round(s.best * 100)}%`}</td>
											<td>{s.attempts}</td>
										</tr>
									{/each}
								</tbody>
							</table>
							<p class="teacher-archive">
								{#if deletingWork === a.id}
									<span>Remove this work? Students' answers are kept.</span>
									<button type="button" class="quiz-btn quiz-btn--danger" onclick={() => deleteWork(a)}>Yes, remove</button>
									<button type="button" class="quiz-btn" onclick={() => (deletingWork = null)}>Cancel</button>
								{:else}
									<button type="button" class="quiz-btn" onclick={() => (deletingWork = a.id)}>Remove</button>
								{/if}
							</p>
						</details>
					{/each}
				{/if}
			</section>
		{:else if tab === 'students'}
		<!-- Students -->
		<section class="teacher-section" aria-labelledby="students-heading">
			<div class="teacher-section-head">
				<h2 id="students-heading">Students</h2>
				{#if students.length}
					<label class="account-check">
						<input type="checkbox" bind:checked={showAll} /> Show all codes
					</label>
				{/if}
			</div>
			{#if students.length === 0}
				<p class="account-intro">No students yet. Paste their usernames below.</p>
			{:else}
				<table class="teacher-table">
					<thead>
						<tr><th scope="col">Username</th><th scope="col">Login code</th><th scope="col">Last active</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr>
					</thead>
					<tbody>
						{#each students as s (s.id)}
							<tr>
								<td>{s.username}</td>
								<td class="teacher-code">
									{#if codeShown(s)}
										<code>{s.login_code}</code>
									{:else}
										<span class="teacher-code-hidden" aria-label="hidden">••••-••••</span>
									{/if}
									{#if !showAll}
										<button type="button" class="quiz-link-btn" onclick={() => toggleCode(s)} aria-label="{codeShown(s) ? 'Hide' : 'Show'} code for {s.username}">
											{codeShown(s) ? 'Hide' : 'Show'}
										</button>
									{/if}
								</td>
								<td>{shortDate(s.last_active_at)}</td>
								<td class="teacher-actions">
									{#if confirming?.id === s.id}
										<span>{confirming.kind === 'reset' ? `Give ${s.username} a new code?` : `Remove ${s.username} and all their answers?`}</span>
										<button
											type="button"
											class="quiz-btn quiz-btn--danger"
											onclick={() => (confirming?.kind === 'reset' ? resetCode(s) : removeStudent(s))}
										>
											{confirming.kind === 'reset' ? 'Yes, new code' : 'Yes, remove'}
										</button>
										<button type="button" class="quiz-btn" onclick={() => (confirming = null)}>Cancel</button>
									{:else}
										<button type="button" class="quiz-btn" onclick={() => (confirming = { kind: 'reset', id: s.id })}>Reset code</button>
										{#if otherGroups.length}
											<label class="visually-hidden" for="move-{s.id}">Move {s.username} to</label>
											<select id="move-{s.id}" class="account-input teacher-move" bind:value={moveTo[s.id]}>
												<option value="">Move to…</option>
												{#each otherGroups as g (g.id)}<option value={String(g.id)}>{g.name}</option>{/each}
											</select>
											{#if moveTo[s.id]}<button type="button" class="quiz-btn" onclick={() => moveStudent(s)}>Move</button>{/if}
										{/if}
										<button type="button" class="quiz-btn" onclick={() => (confirming = { kind: 'remove', id: s.id })}>Remove</button>
									{/if}
									{#if rowMessage[s.id]}<p class="quiz-hint" role="status">{rowMessage[s.id]}</p>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<div class="quiz-nav">
					<a class="quiz-btn" href="/teacher/group/print/?id={group.id}">Print login slips</a>
					<a class="quiz-btn" href="/api/teacher/groups/{group.id}/codes.csv" download>Download usernames and codes (CSV)</a>
				</div>
			{/if}
		</section>

		<!-- Adding students -->
		<section class="teacher-section" aria-labelledby="add-heading">
			<h2 id="add-heading">Add students</h2>
			{#if created.length}
				<div class="quiz-notice">
					<h3 id="created-heading" tabindex="-1">Added {created.length} student{created.length === 1 ? '' : 's'}</h3>
					<p>Each has a permanent login code. Print the slips or download the codes from the list above.</p>
				</div>
			{/if}
			{#if !preview}
				<label for="paste">Paste usernames, one per line, or upload a CSV with a "username" column.</label>
				<textarea id="paste" class="account-input teacher-paste" bind:value={pasted} rows="8" placeholder={'amy.brown\nben.cole\n…'}></textarea>
				<div class="quiz-nav">
					<label class="quiz-btn teacher-file">
						Upload CSV <input type="file" accept=".csv,text/csv,text/plain" onchange={readFile} class="visually-hidden" />
					</label>
					<button type="button" class="quiz-btn quiz-btn--primary" onclick={previewPaste} disabled={busy || !pasted.trim()}>Preview</button>
				</div>
			{:else}
				<p><strong>{preview.create.length}</strong> student{preview.create.length === 1 ? '' : 's'} will be added{preview.skip.length ? `, and ${preview.skip.length} skipped` : ''}. Nothing is created until you confirm.</p>
				{#if preview.create.length}
					<details open>
						<summary>To add ({preview.create.length})</summary>
						<ul class="teacher-preview">{#each preview.create as u (u)}<li>{u}</li>{/each}</ul>
					</details>
				{/if}
				{#if preview.skip.length}
					<details open>
						<summary>Skipped ({preview.skip.length})</summary>
						<ul class="teacher-preview">{#each preview.skip as s, i (i)}<li><strong>{s.username}</strong> {s.reason}</li>{/each}</ul>
					</details>
				{/if}
				<div class="quiz-nav">
					<button type="button" class="quiz-btn quiz-btn--primary" onclick={confirmAdd} disabled={busy || preview.create.length === 0}>
						Add {preview.create.length} student{preview.create.length === 1 ? '' : 's'}
					</button>
					<button type="button" class="quiz-btn" onclick={() => (preview = null)}>Back to the list</button>
				</div>
			{/if}
			{#if addMessage}<p class="quiz-error" role="alert">{addMessage}</p>{/if}
		</section>

		{:else}
		<!-- Settings -->
		<section class="teacher-section" aria-labelledby="settings-heading">
			<h2 id="settings-heading">Settings</h2>
			<form class="teacher-settings" onsubmit={saveSettings}>
				<label for="edit-name">Name</label>
				<input id="edit-name" class="account-input" bind:value={editName} maxlength="60" required />
				<label for="edit-spec">Spec</label>
				<select id="edit-spec" class="account-input" bind:value={editSpec}>
					{#each Object.entries(SPEC_NAMES) as [value, label] (value)}<option {value}>{label}</option>{/each}
				</select>
				<label for="edit-cooldown">Retry cooldown (hours)</label>
				<input id="edit-cooldown" class="account-input" type="number" min="0" max="336" bind:value={editCooldown} aria-describedby="cooldown-hint" />
				<p class="quiz-hint" id="cooldown-hint">
					The shortest gap before a student can retry the same topic quiz. 0 means no limit. Spacing practice out helps it stick; mistakes and mixed
					review are never limited.
				</p>
				{#if settingsMessage}<p class="quiz-error" role="alert">{settingsMessage}</p>{/if}
				<button type="submit" class="quiz-btn quiz-btn--primary">Save settings</button>
			</form>
			<p class="teacher-archive">
				{#if group.archived}
					<button type="button" class="quiz-btn" onclick={() => setArchived(false)}>Restore this group</button>
				{:else}
					<button type="button" class="quiz-btn" onclick={() => setArchived(true)}>Archive this group</button>
					<span class="quiz-hint">Archiving hides it from your list. It doesn't delete anything.</span>
				{/if}
			</p>
		</section>

		<!-- Sharing -->
		<section class="teacher-section" aria-labelledby="share-heading">
			<h2 id="share-heading">Shared with</h2>
			<ul class="summary-list">
				{#each teachers as t (t.id)}
					<li>
						{t.email}{#if t.owner} <span class="quiz-hint">(owner)</span>{/if}
						{#if !t.owner}<button type="button" class="quiz-link-btn" onclick={() => unshare(t)}>Remove</button>{/if}
					</li>
				{/each}
			</ul>
			<form class="work-form" onsubmit={share}>
				<label for="share-email">Share with another teacher</label>
				<input id="share-email" class="account-input" type="email" bind:value={shareEmail} placeholder="their school email" required />
				<button type="submit" class="quiz-btn">Share</button>
			</form>
			<p class="quiz-hint">They'll see the group, its students and their progress. Only the owner can remove other teachers.</p>
			{#if shareMessage}<p class="quiz-notice" role="status">{shareMessage}</p>{/if}
		</section>

		<!-- Deleting -->
		<section class="teacher-section teacher-danger" id="delete" aria-labelledby="delete-heading">
			<h2 id="delete-heading">Delete this group</h2>
			<p>
				This permanently deletes the group, its {students.length} student{students.length === 1 ? '' : 's'} and all their answers and activity. It can't be
				undone. <a href="/api/teacher/groups/{group.id}/codes.csv" download>Download the codes</a> first if you need them.
			</p>
			<label for="confirm-name">Type the group's name, <strong>{group.name}</strong>, to confirm</label>
			<input id="confirm-name" class="account-input" bind:value={typedName} autocomplete="off" />
			{#if deleteMessage}<p class="quiz-error" role="alert">{deleteMessage}</p>{/if}
			<button type="button" class="quiz-btn quiz-btn--danger" onclick={deleteGroup} disabled={typedName.trim() !== group.name}>
				Delete {group.name} permanently
			</button>
		</section>
		{/if}
	{/if}
</div>
