// Browser-side helpers for the teacher pages. The pages are static; all their
// data comes from /api/teacher/*, which checks the teacher's session and
// access on every request.

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

/** Call a teacher endpoint with JSON. A 401 sends the teacher to sign in. */
export async function teacherApi<T>(method: string, url: string, body?: unknown): Promise<T> {
	const res = await fetch(url, {
		method,
		headers: body === undefined ? {} : { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = (await res.json().catch(() => ({}))) as { message?: string };
	if (res.status === 401) {
		location.href = `/teacher/login/?next=${encodeURIComponent(location.pathname + location.search)}`;
		throw new ApiError(401, 'Please sign in.');
	}
	if (!res.ok) throw new ApiError(res.status, data.message || 'Something went wrong. Please try again.');
	return data as T;
}

export interface Group {
	id: number;
	name: string;
	spec: string;
	retry_cooldown_hours: number;
	archived: number;
	created_at: string;
	students: number;
	needs_deleting: boolean;
}

export interface GroupStudent {
	id: number;
	username: string;
	login_code: string;
	created_at: string;
	last_active_at: string | null;
}

export const SPEC_NAMES: Record<string, string> = {
	'gcse-legacy': 'GCSE (current spec)',
	'gcse-2026': 'GCSE (2026 spec)'
};

export const shortDate = (iso: string | null) =>
	iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** A ?id= query parameter as a number, or null. */
export function idFromQuery(): number | null {
	const id = Number(new URLSearchParams(location.search).get('id'));
	return Number.isInteger(id) && id > 0 ? id : null;
}
