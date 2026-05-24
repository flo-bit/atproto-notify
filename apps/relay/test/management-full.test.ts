import type { Did } from '@atcute/lexicons';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import worker from '../src/index';

import { installFetchMock, makeIdentity, makeJwt, mockPlc, xrpcPost, type TestIdentity } from './helpers';

beforeAll(() => {
  installFetchMock();
});

const MANAGE = 'pub.atmo.notify.manage';

async function call(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/** Dual-auth manage call: app bearer + user token (both lxm=manage). */
async function manage(
  app: TestIdentity,
  user: TestIdentity,
  body: { method: string; params?: unknown },
): Promise<Response> {
  const appJwt = await makeJwt(app, { lxm: MANAGE });
  const userToken = await makeJwt(user, { lxm: MANAGE });
  return call(xrpcPost(MANAGE, appJwt, { userToken, ...body }));
}

/** Make an app + user, grant, and designate the app at `level`. */
async function setup(
  tag: string,
  level: 'none' | 'self' | 'full',
): Promise<{ app: TestIdentity; user: TestIdentity }> {
  const app = await makeIdentity(`did:plc:${tag}-app`);
  const user = await makeIdentity(`did:plc:${tag}-user`);
  mockPlc(app);
  mockPlc(user);
  await q.upsertGrant(env.DB, {
    recipientDid: user.did,
    senderDid: app.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null,
  });
  if (level !== 'none') await q.setGrantManage(env.DB, user.did, app.did, level);
  return { app, user };
}

it('full manager: listGrants returns the account’s grants', async () => {
  const { app, user } = await setup('mf-list', 'full');
  const res = await manage(app, user, { method: 'listGrants' });
  expect(res.status).toBe(200);
  const data = (await res.json()) as { result: { grants: { sender: string }[] } };
  expect(Array.isArray(data.result.grants)).toBe(true);
  expect(data.result.grants.some((g) => g.sender === app.did)).toBe(true);
});

it('full manager: can grant another app on the user’s behalf', async () => {
  const { app, user } = await setup('mf-grant', 'full');
  const target: Did = 'did:plc:mf-target-app';
  const res = await manage(app, user, { method: 'grant', params: { sender: target } });
  expect(res.status).toBe(200);
  expect(await q.getGrant(env.DB, user.did, target)).not.toBeNull();
});

it('self designation is NOT enough for the full surface', async () => {
  const { app, user } = await setup('mf-self', 'self');
  const res = await manage(app, user, { method: 'listGrants' });
  expect(res.status).toBe(403);
});

it('undesignated (granted but manage=none) is denied', async () => {
  const { app, user } = await setup('mf-none', 'none');
  const res = await manage(app, user, { method: 'listGrants' });
  expect(res.status).toBe(403);
});

it('vouch (no user token) is rejected even for a designated full manager', async () => {
  const { app, user } = await setup('mf-vouch', 'full');
  const appJwt = await makeJwt(app, { lxm: MANAGE });
  // No userToken — the vouch path is gone, so a body `did` alone is not enough.
  const res = await call(xrpcPost(MANAGE, appJwt, { method: 'getSettings', did: user.did }));
  expect(res.status).toBe(403);
});

it('a full manager works with a user token', async () => {
  const { app, user } = await setup('mf-token', 'full');
  const res = await manage(app, user, { method: 'getSettings' });
  expect(res.status).toBe(200);
});

it('unknown method → 400', async () => {
  const { app, user } = await setup('mf-unknown', 'full');
  const res = await manage(app, user, { method: 'deleteEverything' });
  expect(res.status).toBe(400);
});
