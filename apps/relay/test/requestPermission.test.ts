import type { Did } from '@atcute/lexicons';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import worker from '../src/index';

import { installFetchMock, makeBskyProfileMock, makeIdentity, makeJwt, mockPlc, xrpcPost } from './helpers';

beforeAll(() => {
  installFetchMock();
  // The sender profile refresh runs fire-and-forget; stub it so it never hits network.
  makeBskyProfileMock();
});

const REQ = 'tools.atmo.notifs.requestPermission';
// requestPermission is now user-authenticated; the sender is a plain DID in the body.
const SENDER: Did = 'did:plc:somesender';

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

it('first request creates a pending request with the supplied metadata', async () => {
  const user = await makeIdentity('did:plc:requser1');
  mockPlc(user);
  const jwt = await makeJwt(user, { lxm: REQ });

  const res = await call(
    xrpcPost(REQ, jwt, { senderDid: SENDER, title: 'Bookhive', description: 'New comments' }),
  );

  expect(res.status).toBe(200);
  const data = (await res.json()) as RequestResult;
  expect(data.status).toBe('pending');

  const pending = await q.getPendingByPair(env.DB, user.did, SENDER);
  expect(pending).not.toBeNull();
  expect(pending?.title).toBe('Bookhive');
  expect(pending?.description).toBe('New comments');
});

it('a duplicate within the window returns the same pending request', async () => {
  const user = await makeIdentity('did:plc:requser2');
  mockPlc(user);
  const jwt = await makeJwt(user, { lxm: REQ });
  const body = { senderDid: SENDER, title: 'Bookhive' };

  const first = (await (await call(xrpcPost(REQ, jwt, body))).json()) as RequestResult;
  const second = (await (await call(xrpcPost(REQ, jwt, body))).json()) as RequestResult;

  expect(second.id).toBe(first.id);
  const count = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM pending_requests WHERE recipient_did = ? AND sender_did = ?',
  )
    .bind(user.did, SENDER)
    .first<{ c: number }>();
  expect(count?.c).toBe(1);
});

it('returns alreadyGranted when a grant exists', async () => {
  const user = await makeIdentity('did:plc:requser3');
  mockPlc(user);
  await q.upsertGrant(env.DB, {
    recipientDid: user.did,
    senderDid: SENDER,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null,
  });
  const jwt = await makeJwt(user, { lxm: REQ });

  const res = await call(xrpcPost(REQ, jwt, { senderDid: SENDER, title: 'Bookhive' }));

  const data = (await res.json()) as RequestResult;
  expect(data.status).toBe('alreadyGranted');
});

it('returns 429 when the per-recipient rate limit is exceeded', async () => {
  const user = await makeIdentity('did:plc:requser4');
  mockPlc(user);
  // Seed the per-recipient hourly counter at its limit (50) so the next trips it.
  await env.CACHE.put(`rl:req:recipient:${user.did}`, '50', {
    expirationTtl: 3600,
    metadata: { expiresAt: Date.now() + 3_600_000 },
  });
  const jwt = await makeJwt(user, { lxm: REQ });

  const res = await call(xrpcPost(REQ, jwt, { senderDid: SENDER, title: 'Bookhive' }));

  expect(res.status).toBe(429);
});
