import type { Did } from '@atcute/lexicons';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import worker from '../src/index';

import { installFetchMock, makeIdentity, makeJwt, mockPlc, xrpcPost } from './helpers';

beforeAll(() => {
  installFetchMock();
});

const SENDER: Did = 'did:plc:grantsender';

async function call(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

it('grant inserts a row and consumes the pending request', async () => {
  const user = await makeIdentity('did:plc:grantuser');
  mockPlc(user);
  await q.insertPending(env.DB, {
    id: 'req-1',
    recipientDid: user.did,
    senderDid: SENDER,
    reason: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + 1_000_000,
  });

  const jwt = await makeJwt(user, { lxm: 'tools.atmo.notifs.grant' });
  const res = await call(xrpcPost('tools.atmo.notifs.grant', jwt, { sender: SENDER, requestId: 'req-1' }));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ granted: true });
  expect(await q.getGrant(env.DB, user.did, SENDER)).not.toBeNull();
  expect(await q.getPendingById(env.DB, 'req-1')).toBeNull();
});

it('revoke removes the grant', async () => {
  const user = await makeIdentity('did:plc:revokeuser');
  mockPlc(user);
  await q.upsertGrant(env.DB, user.did, SENDER, Date.now());

  const jwt = await makeJwt(user, { lxm: 'tools.atmo.notifs.revoke' });
  const res = await call(xrpcPost('tools.atmo.notifs.revoke', jwt, { sender: SENDER }));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ revoked: true });
  expect(await q.getGrant(env.DB, user.did, SENDER)).toBeNull();
});
