<script lang="ts">
	// Students against topics, spec points or command words. Every cell says
	// its status in words (and a percentage); the colour only backs it up.
	import type { Heatmap } from '$lib/server/analysis';

	let { data }: { data: Heatmap } = $props();

	const short: Record<string, string> = {
		secure: 'Secure',
		getting_there: 'Getting there',
		not_secure: 'Not secure',
		not_started: '—'
	};
	const pct = (v: number | null) => (v === null ? '' : `${Math.round(v * 100)}%`);
	const axis = $derived({ topic: 'Topic', spec_point: 'Spec point', command: 'Command word' }[data.by]);
</script>

{#if data.rows.length === 0}
	<p class="account-intro">No students yet.</p>
{:else if data.columns.length === 0}
	<p class="account-intro">Nothing answered yet.</p>
{:else}
	<div class="heatmap-scroll">
		<table class="heatmap">
			<caption class="visually-hidden">Each student's status by {axis.toLowerCase()}</caption>
			<thead>
				<tr>
					<th scope="col">Student</th>
					{#each data.columns as c (c.key)}<th scope="col">{c.label}</th>{/each}
				</tr>
			</thead>
			<tbody>
				{#each data.rows as r (r.student_id)}
					<tr>
						<th scope="row"><a href="/teacher/student/?id={r.student_id}">{r.username}</a></th>
						{#each r.cells as cell, i (data.columns[i].key)}
							<td class="heatmap-cell status-{cell.status}" title={cell.note ? `${cell.label} — ${cell.note}` : cell.label}>
								<span class="heatmap-label">{short[cell.status]}</span>
								{#if cell.value !== null}<span class="heatmap-value">{pct(cell.value)}</span>{/if}
								{#if cell.note}<span class="heatmap-note">{cell.note === 'due for review' ? 'due for review' : cell.note.startsWith('try') ? 'needs coverage' : 'needs spacing'}</span>{/if}
								{#if cell.overconfident}<span class="heatmap-flag">⚠ overconfident</span>{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
