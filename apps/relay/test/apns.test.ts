import { beforeAll, beforeEach, expect, it } from 'vitest';

import { type ApnsPayload, sendApns } from '../src/delivery/apns';
import type { Env } from '../src/env';

// --- helpers ---------------------------------------------------------------

function toPem(der: ArrayBuffer, label: string): string {
  let bin = '';
  for (const b of new Uint8Array(der)) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

function decodeJwtSegment(seg: string): Record<string, unknown> {
  const b64 = seg.replaceAll('-', '+').replaceAll('_', '/');
  return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
}

const PAYLOAD: ApnsPayload = {
  aps: { alert: { title: 'Hi', body: 'there' }, 'thread-id': 'did:plc:s' },
  senderDid: 'did:plc:s',
  notifId: 'n1',
};

let env: Env;
let captured: { url: string; init: RequestInit } | null = null;
let nextStatus = 200;
let nextBody: unknown = {};

beforeAll(async () => {
  const { privateKey } = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
  env = {
    APNS_KEY_ID: 'KEY123',
    APNS_TEAM_ID: 'TEAM123',
    APNS_BUNDLE_ID: 'tools.atmo.notifs.app',
    APNS_PRIVATE_KEY: toPem(pkcs8, 'PRIVATE KEY'),
  } as unknown as Env;
});

beforeEach(() => {
  captured = null;
  nextStatus = 200;
  nextBody = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured = { url: String(input), init: init ?? {} };
    return new Response(JSON.stringify(nextBody), {
      status: nextStatus,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
});

it('signs an ES256 provider token, sets APNs headers, and posts the payload', async () => {
  const result = await sendApns(env, 'device-token-abc', PAYLOAD);
  expect(result).toEqual({ ok: true });

  expect(captured?.url).toBe('https://api.push.apple.com/3/device/device-token-abc');
  const headers = new Headers(captured?.init.headers);
  expect(headers.get('apns-topic')).toBe('tools.atmo.notifs.app');
  expect(headers.get('apns-push-type')).toBe('alert');
  expect(headers.get('apns-priority')).toBe('10');

  const auth = headers.get('authorization') ?? '';
  expect(auth.startsWith('bearer ')).toBe(true);
  const [h, p] = auth.slice('bearer '.length).split('.');
  expect(decodeJwtSegment(h)).toMatchObject({ alg: 'ES256', kid: 'KEY123' });
  const claims = decodeJwtSegment(p);
  expect(claims.iss).toBe('TEAM123');
  expect(typeof claims.iat).toBe('number');

  const body = JSON.parse(String(captured?.init.body)) as ApnsPayload;
  expect(body.aps.alert).toEqual({ title: 'Hi', body: 'there' });
  expect(body.notifId).toBe('n1');
});

it('410 Unregistered → dead', async () => {
  nextStatus = 410;
  nextBody = { reason: 'Unregistered' };
  expect(await sendApns(env, 'tok', PAYLOAD)).toEqual({ ok: false, reason: 'dead' });
});

it('400 BadDeviceToken → dead', async () => {
  nextStatus = 400;
  nextBody = { reason: 'BadDeviceToken' };
  expect(await sendApns(env, 'tok', PAYLOAD)).toEqual({ ok: false, reason: 'dead' });
});

it('503 → transient (retry)', async () => {
  nextStatus = 503;
  nextBody = {};
  expect(await sendApns(env, 'tok', PAYLOAD)).toEqual({ ok: false, reason: 'transient' });
});
