// "Lite session" — a signed cookie carrying just the user's DID, minted when a
// user arrives via a cross-app login link (`/applogin`, see CROSS-APP-AUTH.md)
// rather than the full OAuth flow. The whole app only ever needs `locals.did`
// (every action goes through the trusted RELAY binding), so a lite session is
// functionally identical to an OAuth one — it just can't talk to the user's PDS
// directly, which atmo.pub never does.
//
// HMAC-SHA256 signed with COOKIE_SECRET (the same secret the OAuth lib uses, but
// an independent cookie + scheme). Payload is `{ did, exp }`; `exp` is re-checked
// server-side so a stolen value can't outlive its window even if the browser
// ignores Max-Age. Capped at 30 days (vs. the OAuth cookie's 180) to shrink the
// blast radius of a leaked link.
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Did } from '@atcute/lexicons';

export const LITE_SESSION_COOKIE = 'atmo_session';
export const LITE_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, seconds

/** Cookie attributes shared by set + delete. SameSite=Lax so the cookie is sent
 *  on the top-level navigation that lands the user here from another app. */
export const liteCookieOptions = {
	httpOnly: true,
	secure: !dev,
	sameSite: 'lax',
	path: '/',
	maxAge: LITE_SESSION_MAX_AGE
} as const;

interface LitePayload {
	did: Did;
	/** Unix seconds. */
	exp: number;
}

function secret(): string {
	const s = env.COOKIE_SECRET;
	if (s) return s;
	// Mirror the OAuth lib's dev behaviour: a fixed insecure fallback so local
	// dev works without configuring the secret. Never reached in production
	// (COOKIE_SECRET is required there).
	if (dev) return 'dev-insecure-cookie-secret';
	throw new Error('COOKIE_SECRET is not set');
}

let keyPromise: Promise<CryptoKey> | null = null;
function hmacKey(): Promise<CryptoKey> {
	keyPromise ??= crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret()),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
	return keyPromise;
}

function b64urlEncode(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array<ArrayBuffer> {
	const padded = str.replaceAll('-', '+').replaceAll('_', '/');
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** Produce a signed cookie value for the given DID. */
export async function signLiteSession(did: Did): Promise<string> {
	const payload: LitePayload = { did, exp: Math.floor(Date.now() / 1000) + LITE_SESSION_MAX_AGE };
	const data = new TextEncoder().encode(JSON.stringify(payload));
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), data));
	return `${b64urlEncode(data)}.${b64urlEncode(mac)}`;
}

/** Verify a cookie value and return the DID, or null if invalid/expired. */
export async function verifyLiteSession(value: string | undefined): Promise<Did | null> {
	if (!value) return null;
	const dot = value.indexOf('.');
	if (dot <= 0) return null;
	let data: Uint8Array<ArrayBuffer>;
	let mac: Uint8Array<ArrayBuffer>;
	try {
		data = b64urlDecode(value.slice(0, dot));
		mac = b64urlDecode(value.slice(dot + 1));
	} catch {
		return null;
	}
	if (!(await crypto.subtle.verify('HMAC', await hmacKey(), mac, data))) return null;

	let payload: LitePayload;
	try {
		payload = JSON.parse(new TextDecoder().decode(data));
	} catch {
		return null;
	}
	if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
	if (typeof payload.did !== 'string' || !payload.did.startsWith('did:')) return null;
	return payload.did as Did;
}
