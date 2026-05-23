// Small Web Crypto helpers shared by the APNs (ES256) and FCM (RS256) push
// signers. Workers provide the standard Web Crypto API, so no Node `crypto`.

/** Result of a push attempt, shared by `sendApns` / `sendFcm`. */
export type PushResult = { ok: true } | { ok: false; reason: 'dead' | 'transient' };

/** Base64url-encode raw bytes (no padding). */
export function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Base64url-encode a UTF-8 string (for JWT header/claim segments). */
export function b64urlString(input: string): string {
  return b64url(new TextEncoder().encode(input));
}

/** Decode a PKCS#8 PEM ("-----BEGIN PRIVATE KEY-----" …) into its DER bytes. */
export function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Sign a compact JWS (`header.claims.signature`). For `ES256` Web Crypto returns
 * the IEEE-P1363 (r‖s) signature JWT expects; for `RS256` it returns the raw
 * PKCS#1 v1.5 signature. Either way we just base64url it.
 */
export async function signJwt(
  key: CryptoKey,
  alg: 'ES256' | 'RS256',
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
): Promise<string> {
  const signingInput = `${b64urlString(JSON.stringify({ alg, typ: 'JWT', ...header }))}.${b64urlString(
    JSON.stringify(claims),
  )}`;
  const data = new TextEncoder().encode(signingInput);
  const sig =
    alg === 'ES256'
      ? await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data)
      : await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, data);
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}
