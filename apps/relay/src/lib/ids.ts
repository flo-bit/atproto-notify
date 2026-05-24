import { nanoid } from 'nanoid';

/** Generate a collision-resistant id for pending requests, delivery logs, etc. */
export function newId(): string {
  return nanoid();
}

/**
 * Generate a short, stable id for a delivery target. It appears in route strings
 * (`push:<id>`); nanoid's url-safe alphabet (A–Z a–z 0–9 _ -) never contains the
 * `+`/`:` route separators, so it's safe to embed. 12 chars ≈ 71 bits.
 */
export function newTargetId(): string {
  return nanoid(12);
}

/**
 * Generate a 32-character URL-safe link token.
 *
 * Uses `crypto.getRandomValues` (CSPRNG) rather than `Math.random`. 24 random
 * bytes encode to exactly 32 base64url characters with no padding.
 */
export function newLinkToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
