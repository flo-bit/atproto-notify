import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:test';
import { afterEach, expect, it } from 'vitest';

import type { DispatchJob } from '../src/env';
import { handleQueue } from '../src/delivery/dispatcher';
import * as q from '../src/db/queries';
import { grant } from '../src/rpc/ops';

const EXAMPLE: Did = 'did:web:example.atmo.pub'; // registered with a callbackUrl
const UNREGISTERED: Did = 'did:web:nope.example';
const LXM = 'pub.atmo.notify.subscriberChanged';
const CALLBACK_URL = `https://example.atmo.pub/xrpc/${LXM}`;

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Replace global fetch with a capturing stub for the duration of a test. */
function captureFetch(status = 200): { calls: Captured[] } {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { calls };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Decode a JWT payload without verifying (claims assertion only). */
function jwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]!.replaceAll('-', '+').replaceAll('_', '/');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part), (c) => c.charCodeAt(0))));
}

function batchOf(job: DispatchJob) {
  let acked = 0;
  let retried = 0;
  const batch = {
    messages: [{ body: job, ack: () => acked++, retry: () => retried++ }],
  } as unknown as MessageBatch<DispatchJob>;
  return { batch, result: () => ({ acked, retried }) };
}

it('POSTs a relay-signed callback to the app on enable', async () => {
  const { calls } = captureFetch(200);
  const { batch, result } = batchOf({
    kind: 'subscriberChanged',
    sender: EXAMPLE,
    recipient: 'did:plc:subuser',
    enabled: true,
    changedAt: '2026-05-23T00:00:00.000Z',
  });

  await handleQueue(batch, env);

  expect(result()).toEqual({ acked: 1, retried: 0 });
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toBe(CALLBACK_URL);
  expect(calls[0]!.body).toEqual({
    recipient: 'did:plc:subuser',
    enabled: true,
    changedAt: '2026-05-23T00:00:00.000Z',
  });

  const auth = calls[0]!.headers.authorization;
  expect(auth?.startsWith('Bearer ')).toBe(true);
  const payload = jwtPayload(auth!.slice('Bearer '.length));
  expect(payload.iss).toBe(env.RELAY_DID);
  expect(payload.aud).toBe(EXAMPLE);
  expect(payload.lxm).toBe(LXM);
});

it('carries enabled:false on revoke', async () => {
  const { calls } = captureFetch(200);
  const { batch } = batchOf({
    kind: 'subscriberChanged',
    sender: EXAMPLE,
    recipient: 'did:plc:subuser',
    enabled: false,
    changedAt: '2026-05-23T00:00:00.000Z',
  });

  await handleQueue(batch, env);

  expect(calls[0]!.body).toMatchObject({ enabled: false });
});

it('retries on a 5xx from the app, drops on a 4xx', async () => {
  const five = captureFetch(503);
  const a = batchOf({
    kind: 'subscriberChanged',
    sender: EXAMPLE,
    recipient: 'did:plc:x',
    enabled: true,
    changedAt: '2026-05-23T00:00:00.000Z',
  });
  await handleQueue(a.batch, env);
  expect(a.result()).toEqual({ acked: 0, retried: 1 });
  expect(five.calls).toHaveLength(1);

  captureFetch(400);
  const b = batchOf({
    kind: 'subscriberChanged',
    sender: EXAMPLE,
    recipient: 'did:plc:x',
    enabled: true,
    changedAt: '2026-05-23T00:00:00.000Z',
  });
  await handleQueue(b.batch, env);
  expect(b.result()).toEqual({ acked: 1, retried: 0 });
});

it('does not call out for an unregistered sender', async () => {
  const { calls } = captureFetch(200);
  const { batch, result } = batchOf({
    kind: 'subscriberChanged',
    sender: UNREGISTERED,
    recipient: 'did:plc:x',
    enabled: true,
    changedAt: '2026-05-23T00:00:00.000Z',
  });

  await handleQueue(batch, env);

  expect(calls).toHaveLength(0);
  expect(result()).toEqual({ acked: 1, retried: 0 });
});

it('grant() for a registered app creates the grant (and enqueues the callback)', async () => {
  const user: Did = 'did:plc:granter-cb';
  await grant(env, user, { sender: EXAMPLE });
  expect(await q.getGrant(env.DB, user, EXAMPLE)).not.toBeNull();
});
