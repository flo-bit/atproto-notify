// Low-level WebCrypto helpers for Web Push (RFC 8291 / 8188 / 8292). No
// node:crypto, so this runs on Cloudflare Workers. Binary I/O is Uint8Array;
// base64url is the unpadded URL-safe variant used throughout the Web Push specs.

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const encoder = new TextEncoder();
export function utf8(s: string): Uint8Array {
  return encoder.encode(s);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** HKDF (extract + expand) via WebCrypto; returns `length` bytes. */
export async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Generate an ephemeral P-256 ECDH keypair; returns the raw uncompressed public point (65 bytes). */
export async function generateEcdhKeypair(): Promise<{ publicKey: Uint8Array; privateKey: CryptoKey }> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer;
  return { publicKey: new Uint8Array(raw), privateKey: kp.privateKey };
}

/** ECDH shared secret (the X coordinate, 32 bytes) between our private key and a raw peer public point. */
export async function ecdhSharedSecret(
  privateKey: CryptoKey,
  peerPublicRaw: Uint8Array,
): Promise<Uint8Array> {
  const peer = await crypto.subtle.importKey(
    'raw',
    peerPublicRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  // workerd uses the standard `public` field; @cloudflare/workers-types names it
  // `$public`, so cast to satisfy the compiler while passing the runtime-correct shape.
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peer } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0],
    privateKey,
    256,
  );
  return new Uint8Array(bits);
}

/** AES-128-GCM encrypt; WebCrypto appends the 16-byte auth tag to the ciphertext. */
export async function aesGcmEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, k, data);
  return new Uint8Array(ct);
}

/** ECDSA P-256 / SHA-256 signature as raw r||s (64 bytes) — the JOSE ES256 form for VAPID JWTs. */
export async function ecdsaSign(privateJwk: JsonWebKey, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data);
  return new Uint8Array(sig);
}
