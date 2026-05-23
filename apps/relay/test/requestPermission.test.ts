import type { Did } from '@atcute/lexicons';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import worker from '../src/index';

import {
  installFetchMock,
  makeBskyProfileMock,
  makeIdentity,
  makeJwt,
  mockPlc,
  xrpcPost,
} from './helpers';

beforeAll(() => {
  installFetchMock();
  // Sender profile refresh runs fire-and-forget; stub it so it never hits network.
  makeBskyProfileMock();
});

const REQ = 'tools.atmo.notifs.requestPermission';
const RECIPIENT: Did = 'did:plc:reqrecipient';

async function call(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

interface RequestResult {
  id: string;
  status: string;
}

it('first request creates a pending request', async () => {
  const sender = await makeIdentity('did:plc:reqfirst');
  mockPlc(sender);
  const jwt = await makeJwt(sender, { lxm: REQ });

  const res = await call(xrpcPost(REQ, jwt, { recipient: RECIPIENT, reason: 'because' }));

  expect(res.status).toBe(200);
  const data = (await res.json()) as RequestResult;
  expect(data.status).toBe('pending');
  expect(typeof data.id).toBe('string');
  expect(await q.getPendingByPair(env.DB, RECIPIENT, sender.did)).not.toBeNull();
});

it('a duplicate within the window returns the same pending request', async () => {
  const sender = await makeIdentity('did:plc:reqdup');
  mockPlc(sender);
  const jwt = await makeJwt(sender, { lxm: REQ });

  const first = (await (await call(xrpcPost(REQ, jwt, { recipient: RECIPIENT }))).json()) as RequestResult;
  const second = (await (await call(xrpcPost(REQ, jwt, { recipient: RECIPIENT }))).json()) as RequestResult;

  expect(second.id).toBe(first.id);
  const count = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM pending_requests WHERE recipient_did = ? AND sender_did = ?',
  )
    .bind(RECIPIENT, sender.did)
    .first<{ c: number }>();
  expect(count?.c).toBe(1);
});

it('returns alreadyGranted when a grant exists', async () => {
  const sender = await makeIdentity('did:plc:reqgranted');
  mockPlc(sender);
  await q.upsertGrant(env.DB, RECIPIENT, sender.did, Date.now());
  const jwt = await makeJwt(sender, { lxm: REQ });

  const res = await call(xrpcPost(REQ, jwt, { recipient: RECIPIENT }));

  const data = (await res.json()) as RequestResult;
  expect(data.status).toBe('alreadyGranted');
});

it('returns 429 when the per-sender rate limit is exceeded', async () => {
  const sender = await makeIdentity('did:plc:reqratelimited');
  mockPlc(sender);
  // Seed the hourly counter at the limit so the next request trips it.
  await env.CACHE.put(`rl:req:${sender.did}`, '100', {
    expirationTtl: 3600,
    metadata: { expiresAt: Date.now() + 3_600_000 },
  });
  const jwt = await makeJwt(sender, { lxm: REQ });

  const res = await call(xrpcPost(REQ, jwt, { recipient: RECIPIENT }));

  expect(res.status).toBe(429);
});
