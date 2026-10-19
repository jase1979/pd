// Fixed-window rate limiting on D1, as in visual-tkinter. One row per key,
// updated in a single upsert that also restarts a window that has run out.
// Keys are SHA-256 hashed, so no email or IP address is stored.

import { sha256Hex } from './students';

/**
 * Count one hit against scope + value. True if it's within `limit` hits per
 * `windowMs`. The upsert is one statement, so concurrent requests can't both
 * read "under the limit" and both go ahead.
 */
export async function hitRateLimit(
	db: D1Database,
	scope: string,
	value: string,
	limit: number,
	windowMs: number,
	now = Date.now()
): Promise<boolean> {
	const row = await db
		.prepare(
			`INSERT INTO rate_limits (key, count, window_start) VALUES (?1, 1, ?2)
			 ON CONFLICT (key) DO UPDATE SET
			   count        = CASE WHEN rate_limits.window_start <= ?3 THEN 1  ELSE rate_limits.count + 1 END,
			   window_start = CASE WHEN rate_limits.window_start <= ?3 THEN ?2 ELSE rate_limits.window_start END
			 RETURNING count`
		)
		.bind(`${scope}:${await sha256Hex(value)}`, now, now - windowMs)
		.first<{ count: number }>();
	return !row || row.count <= limit;
}
