// Firebase Cloud Messaging (FCM HTTP v1) delivery. We mint a short-lived OAuth2
// access token from the service account (RS256 JWT bearer grant) and cache it in
// KV so we don't re-mint per request.
import type { Env } from '../env';

import { pemToArrayBuffer, type PushResult, signJwt } from './push-crypto';

/** FCM HTTP v1 message body (minus the `token`, which `sendFcm` fills in). */
export interface FcmPayload {
  notification: { title: string; body: string };
  android?: {
    priority?: 'normal' | 'high';
    notification?: { channel_id?: string; tag?: string };
  };
  data?: Record<string, string>;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  token_uri?: string;
  project_id?: string;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const ACCESS_TOKEN_CACHE_KEY = 'fcm:access_token';
const ACCESS_TOKEN_TTL_SECONDS = 3300; // 55 min (Google issues 1-hour tokens)

// Cached per worker isolate.
let serviceAccount: ServiceAccount | null = null;
let keyPromise: Promise<CryptoKey> | null = null;

function getServiceAccount(env: Env): ServiceAccount {
  serviceAccount ??= JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  return serviceAccount;
}

function importSigningKey(env: Env): Promise<CryptoKey> {
  keyPromise ??= crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(getServiceAccount(env).private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return keyPromise;
}

async function getAccessToken(env: Env): Promise<string> {
  const cached = await env.CACHE.get(ACCESS_TOKEN_CACHE_KEY);
  if (cached !== null) {
    return cached;
  }
  const sa = getServiceAccount(env);
  const tokenUri = sa.token_uri ?? DEFAULT_TOKEN_URI;
  const nowSec = Math.floor(Date.now() / 1000);
  const key = await importSigningKey(env);
  const assertion = await signJwt(
    key,
    'RS256',
    { kid: sa.private_key_id },
    { iss: sa.client_email, scope: SCOPE, aud: tokenUri, iat: nowSec, exp: nowSec + 3600 },
  );

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`fcm: token exchange failed (${res.status})`);
  }
  const body = (await res.json()) as { access_token?: string };
  if (body.access_token === undefined) {
    throw new Error('fcm: token response missing access_token');
  }
  await env.CACHE.put(ACCESS_TOKEN_CACHE_KEY, body.access_token, {
    expirationTtl: ACCESS_TOKEN_TTL_SECONDS,
  });
  return body.access_token;
}

/** Send one push to a single FCM device token. */
export async function sendFcm(
  env: Env,
  deviceToken: string,
  payload: FcmPayload,
): Promise<PushResult> {
  let accessToken: string;
  try {
    accessToken = await getAccessToken(env);
  } catch (err) {
    console.error('fcm: failed to obtain access token', err);
    return { ok: false, reason: 'transient' };
  }

  let res: Response;
  try {
    res = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`, {
      method: 'POST',
      headers: { authorization: `bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: { token: deviceToken, ...payload } }),
    });
  } catch (err) {
    console.error('fcm: network error', err);
    return { ok: false, reason: 'transient' };
  }

  if (res.status === 200) {
    return { ok: true };
  }
  if (res.status === 404) {
    return { ok: false, reason: 'dead' };
  }
  if (res.status === 400 || res.status === 403) {
    const code = await readErrorCode(res);
    if (code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT' || code === 'NOT_FOUND') {
      return { ok: false, reason: 'dead' };
    }
    return { ok: false, reason: 'transient' };
  }
  // 429, 5xx, anything else → retry later.
  return { ok: false, reason: 'transient' };
}

/** Pull the canonical error code from FCM's error envelope. */
async function readErrorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as {
      error?: { status?: string; details?: Array<{ errorCode?: string }> };
    };
    return body.error?.details?.find((d) => d.errorCode !== undefined)?.errorCode ?? body.error?.status;
  } catch {
    return undefined;
  }
}
