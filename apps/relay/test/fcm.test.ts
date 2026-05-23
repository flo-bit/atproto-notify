import { env as testEnv } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it } from 'vitest';

import { type FcmPayload, sendFcm } from '../src/delivery/fcm';
import type { Env } from '../src/env';

function toPem(der: ArrayBuffer, label: string): string {
  let bin = '';
  for (const b of new Uint8Array(der)) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

const PAYLOAD: FcmPayload = {
  notification: { title: 'Hi', body: 'there' },
  android: { priority: 'high', notification: { channel_id: 'default', tag: 'did:plc:s' } },
  data: { senderDid: 'did:plc:s', notifId: 'n1' },
};

const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://fcm.googleapis.com/v1/projects/proj/messages:send';

let env: Env;
let tokenCalls = 0;
let sendCapture: { headers: Headers; body: unknown } | null = null;
let sendStatus = 200;
let sendBody: unknown = {};

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const serviceAccount = {
    client_email: 'sa@proj.iam.gserviceaccount.com',
    private_key: toPem(pkcs8, 'PRIVATE KEY'),
    private_key_id: 'kid1',
    token_uri: TOKEN_URI,
    project_id: 'proj',
  };
  env = { ...testEnv, FCM_PROJECT_ID: 'proj', FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(serviceAccount) } as Env;
});

beforeEach(() => {
  tokenCalls = 0;
  sendCapture = null;
  sendStatus = 200;
  sendBody = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === TOKEN_URI) {
      tokenCalls++;
      return new Response(JSON.stringify({ access_token: 'at-123', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === SEND_URL) {
      sendCapture = {
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      };
      return new Response(JSON.stringify(sendBody), {
        status: sendStatus,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
});

it('mints an access token, caches it, and sends with a bearer token', async () => {
  const r1 = await sendFcm(env, 'device-tok', PAYLOAD);
  expect(r1).toEqual({ ok: true });
  const r2 = await sendFcm(env, 'device-tok', PAYLOAD);
  expect(r2).toEqual({ ok: true });

  // Second call reuses the KV-cached access token.
  expect(tokenCalls).toBe(1);

  expect(sendCapture?.headers.get('authorization')).toBe('bearer at-123');
  expect(sendCapture?.body).toMatchObject({
    message: { token: 'device-tok', notification: { title: 'Hi', body: 'there' } },
  });
});

it('UNREGISTERED → dead', async () => {
  sendStatus = 404;
  sendBody = { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } };
  expect(await sendFcm(env, 'tok', PAYLOAD)).toEqual({ ok: false, reason: 'dead' });
});

it('5xx → transient', async () => {
  sendStatus = 503;
  sendBody = { error: { status: 'UNAVAILABLE' } };
  expect(await sendFcm(env, 'tok', PAYLOAD)).toEqual({ ok: false, reason: 'transient' });
});
