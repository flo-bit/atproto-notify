// Web Push delivery: RFC 8291 (aes128gcm message encryption) + RFC 8292 (VAPID).
// Pure WebCrypto via ./push-crypto, so it runs on Cloudflare Workers.
import type { Env } from '../env';

import {
  aesGcmEncrypt,
  b64urlDecode,
  b64urlEncode,
  concatBytes,
  ecdhSharedSecret,
  ecdsaSign,
  generateEcdhKeypair,
  hkdf,
  randomBytes,
  utf8,
} from './push-crypto';

/** A browser PushSubscription, flattened (keys base64url-encoded). */
export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The JSON payload the service worker receives in its `push` handler. */
export interface PushPayload {
  title: string;
  body: string;
  uri?: string;
  senderDid: string;
  /** The inbox notification's id, so clicking the push can mark it read. */
  notificationId?: string;
}

/** Thrown on a non-2xx push response; `statusCode` 404/410 means the subscription is dead. */
export class WebPushError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, detail: string) {
    super(`web push failed: ${statusCode} ${detail}`);
    this.name = 'WebPushError';
    this.statusCode = statusCode;
  }
}

const RECORD_SIZE = 4096;

/**
 * Encrypt `plaintext` for a subscription's keys using aes128gcm (RFC 8291).
 * Returns the full message body: `salt(16) | rs(4) | idlen(1) | as_public(65) | ciphertext`.
 */
export async function encryptPayload(
  uaPublicRaw: Uint8Array,
  authSecret: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const as = await generateEcdhKeypair();
  const ecdhSecret = await ecdhSharedSecret(as.privateKey, uaPublicRaw);

  // IKM = HKDF(salt = auth_secret, ikm = ecdh_secret, info = "WebPush: info\0"|ua|as, 32)
  const keyInfo = concatBytes(utf8('WebPush: info\0'), uaPublicRaw, as.publicKey);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = randomBytes(16);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  // Single record: plaintext followed by the 0x02 last-record padding delimiter.
  const padded = concatBytes(plaintext, Uint8Array.of(0x02));
  const ciphertext = await aesGcmEncrypt(cek, nonce, padded);

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RECORD_SIZE, false);
  const header = concatBytes(salt, rs, Uint8Array.of(as.publicKey.length), as.publicKey);
  return concatBytes(header, ciphertext);
}

/** Build the `Authorization: vapid ...` header value for `endpoint` (RFC 8292). */
export async function vapidAuthHeader(
  endpoint: string,
  privateJwk: JsonWebKey,
  publicKey: string,
  subject: string,
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // ≤ 24h
  const payload = b64urlEncode(utf8(JSON.stringify({ aud, exp, sub: subject })));
  const signingInput = `${header}.${payload}`;
  const sig = await ecdsaSign(privateJwk, utf8(signingInput));
  const jwt = `${signingInput}.${b64urlEncode(sig)}`;
  return `vapid t=${jwt}, k=${publicKey}`;
}

/** Deliver one web push message. Throws {@link WebPushError} on a non-2xx response. */
export async function sendWebPush(
  env: Env,
  sub: PushSubscriptionData,
  payload: PushPayload,
): Promise<void> {
  const body = await encryptPayload(
    b64urlDecode(sub.p256dh),
    b64urlDecode(sub.auth),
    utf8(JSON.stringify(payload)),
  );
  const privateJwk = JSON.parse(env.VAPID_PRIVATE_JWK) as JsonWebKey;
  const authorization = await vapidAuthHeader(
    sub.endpoint,
    privateJwk,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_SUBJECT,
  );

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
    },
    body,
  });
  if (!res.ok) {
    throw new WebPushError(res.status, await res.text().catch(() => ''));
  }
}
