// Apple Push Notification service (APNs) delivery over HTTP/2 with token-based
// (JWT) auth. Workers' `fetch` negotiates HTTP/2 transparently.
import type { Env } from '../env';

import { b64url, pemToArrayBuffer, type PushResult, signJwt } from './push-crypto';

const APNS_HOST = 'https://api.push.apple.com';
// Apple accepts a provider token for up to 60 min; refresh well before that.
const JWT_TTL_MS = 20 * 60 * 1000;

/** APNs JSON payload (the `aps` envelope plus our custom top-level keys). */
export interface ApnsPayload {
  aps: {
    alert: { title: string; body: string };
    sound?: string;
    'mutable-content'?: number;
    'thread-id'?: string;
  };
  [key: string]: unknown;
}

// Cached per worker isolate: the imported signing key and the most recent JWT.
let keyPromise: Promise<CryptoKey> | null = null;
let cachedJwt: { token: string; expiresAt: number } | null = null;

function importSigningKey(env: Env): Promise<CryptoKey> {
  keyPromise ??= crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(env.APNS_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return keyPromise;
}

async function getProviderToken(env: Env): Promise<string> {
  const nowMs = Date.now();
  if (cachedJwt !== null && cachedJwt.expiresAt > nowMs) {
    return cachedJwt.token;
  }
  const key = await importSigningKey(env);
  const token = await signJwt(
    key,
    'ES256',
    { kid: env.APNS_KEY_ID },
    { iss: env.APNS_TEAM_ID, iat: Math.floor(nowMs / 1000) },
  );
  cachedJwt = { token, expiresAt: nowMs + JWT_TTL_MS };
  return token;
}

/** Reasons APNs returns (in the JSON body) that mean the token is permanently dead. */
const DEAD_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic']);

/** Send one alert push to a single APNs device token. */
export async function sendApns(
  env: Env,
  deviceToken: string,
  payload: ApnsPayload,
): Promise<PushResult> {
  let token: string;
  try {
    token = await getProviderToken(env);
  } catch (err) {
    console.error('apns: failed to sign provider token', err);
    return { ok: false, reason: 'transient' };
  }

  let res: Response;
  try {
    res = await fetch(`${APNS_HOST}/3/device/${deviceToken}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${token}`,
        'apns-topic': env.APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('apns: network error', err);
    return { ok: false, reason: 'transient' };
  }

  if (res.status === 200) {
    return { ok: true };
  }
  if (res.status === 410) {
    // "Unregistered" — the token is no longer valid.
    return { ok: false, reason: 'dead' };
  }
  if (res.status === 400) {
    const reason = await readReason(res);
    if (reason !== undefined && DEAD_REASONS.has(reason)) {
      return { ok: false, reason: 'dead' };
    }
    return { ok: false, reason: 'transient' };
  }
  // 429 (too many requests), 5xx, anything else → retry later.
  return { ok: false, reason: 'transient' };
}

async function readReason(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { reason?: string };
    return body.reason;
  } catch {
    return undefined;
  }
}
