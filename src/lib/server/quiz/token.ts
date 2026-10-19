// Signed attempt tokens for anonymous users.
//
// Nothing is stored for an anonymous attempt. Instead, /api/attempts/start
// hands back a token saying which questions were served, signed with
// HMAC-SHA256 using QUIZ_SIGNING_SECRET. On submit, the signature proves the
// token came from us and hasn't been edited (e.g. to swap in easier
// questions), and the expiry stops old tokens being reused indefinitely.
//
// Format: base64url(JSON payload) + "." + base64url(signature)

export interface AttemptToken {
	v: 1;
	mode: 'topic';
	quiz_id: string;
	/** Question ids, in the order they were served. */
	q: string[];
	/** Expiry, in milliseconds since 1970. */
	exp: number;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
	try {
		const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
		return Uint8Array.from(binary, (c) => c.charCodeAt(0));
	} catch {
		return null;
	}
}

function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export async function signToken(payload: AttemptToken, secret: string): Promise<string> {
	const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
	const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(body));
	return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

/** The token's payload, or null if it was modified, is malformed or has expired. */
export async function verifyToken(token: unknown, secret: string, now = Date.now()): Promise<AttemptToken | null> {
	if (typeof token !== 'string') return null;
	const [body, sig, extra] = token.split('.');
	if (!body || !sig || extra !== undefined) return null;

	const sigBytes = fromBase64Url(sig);
	if (!sigBytes) return null;
	// crypto.subtle.verify compares in constant time.
	const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), sigBytes, encoder.encode(body));
	if (!valid) return null;

	const bytes = fromBase64Url(body);
	if (!bytes) return null;
	let payload: AttemptToken;
	try {
		payload = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return null;
	}
	if (payload?.v !== 1 || typeof payload.exp !== 'number' || payload.exp <= now) return null;
	return payload;
}
