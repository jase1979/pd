// Student login codes: 8 characters, shown as XXXX-XXXX, permanent unless a
// teacher resets them. The alphabet leaves out 0/O, 1/I/L, which are easy to
// confuse, so a student typing from a printed slip can't mistake one for
// another. 31 symbols, 8 characters: 31^8 ≈ 850 billion codes.

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

/** A new random code, as stored (no dash), e.g. "K7MPQ2XA". */
export function generateCode(): string {
	const n = CODE_ALPHABET.length;
	// Bytes at or above this would make some characters more likely than
	// others (256 isn't a multiple of 31), so they're thrown away.
	const limit = 256 - (256 % n);
	let code = '';
	while (code.length < CODE_LENGTH) {
		const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH * 2));
		for (const b of bytes) {
			if (b < limit && code.length < CODE_LENGTH) code += CODE_ALPHABET[b % n];
		}
	}
	return code;
}

/**
 * What a student typed, as stored: upper case, without the dash or spaces.
 * Null if it can't be a valid code, so it isn't even looked up.
 */
export function normaliseCode(input: unknown): string | null {
	if (typeof input !== 'string') return null;
	const code = input.toUpperCase().replace(/[\s-]/g, '');
	if (code.length !== CODE_LENGTH) return null;
	for (const c of code) if (!CODE_ALPHABET.includes(c)) return null;
	return code;
}

/** "K7MPQ2XA" -> "K7MP-Q2XA", for slips and the teacher's screen. */
export function formatCode(code: string): string {
	return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** A code no other student has. Phase 3 uses this when creating students. */
export async function uniqueCode(db: D1Database): Promise<string> {
	for (let i = 0; i < 10; i++) {
		const code = generateCode();
		const taken = await db.prepare('SELECT 1 FROM students WHERE login_code = ?').bind(code).first();
		if (!taken) return code;
	}
	// 10 collisions in a row among 850 billion codes means something is broken.
	throw new Error('Could not generate a unique login code');
}
