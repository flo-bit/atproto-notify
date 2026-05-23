import type { Did } from '@atcute/lexicons';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import worker from '../src/index';

import { installFetchMock, makeIdentity, makeJwt, mockPlc, xrpcPost, type TestIdentity } from './helpers';

beforeAll(() => {
  installFetchMock();
});

const SETROUTING = 'pub.atmo.notify.setRouting'; // self-write
const GETROUTING = 'pub.atmo.notify.getRouting'; // self-read
const REVOKESELF = 'pub.atmo.notify.revokeSelf'; // self-write
const MUTESELF = 'pub.atmo.notify.muteSelf'; // self-write

async function call(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/** Dual-auth call: app bearer + user consent token, both scoped to `lxm`. */
async function dualCall(
  lxm: string,
  app: TestIdentity,
  user: TestIdentity,
  body: Record<string, unknown> = {},
): Promise<Response> {
  const appJwt = await makeJwt(app, { lxm });
  const userToken = await makeJwt(user, { lxm });
  return call(xrpcPost(lxm, appJwt, { userToken, ...body }));
}

/** Granted but NOT designated (manage='none'). */
async function plain(tag: string): Promise<{ app: TestIdentity; user: TestIdentity }> {
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
  return { app, user };
}

async function designate(user: Did, app: Did, level: 'self' | 'full'): Promise<void> {
  await q.setGrantManage(env.DB, user, app, level);
}

// --- the default self policies: read=open, write=user-allowlist -------------

it('undesignated app: self-READ is allowed (read policy defaults to open)', async () => {
  const { app, user } = await plain('mgmt-read');
  const res = await dualCall(GETROUTING, app, user);
  expect(res.status).toBe(200);
});

it('undesignated app: self-WRITE is denied (write policy defaults to user-allowlist)', async () => {
  const { app, user } = await plain('mgmt-write');
  const res = await dualCall(SETROUTING, app, user, { route: 'telegram' });
  expect(res.status).toBe(403);
  // …and nothing was written.
  expect(await q.getAppRoute(env.DB, user.did, app.did)).toBeNull();
});

it('designated `self`: self-WRITE is allowed', async () => {
  const { app, user } = await plain('mgmt-self-ok');
  await designate(user.did, app.did, 'self');
  const res = await dualCall(SETROUTING, app, user, { route: 'telegram' });
  expect(res.status).toBe(200);
  expect((await q.getAppRoute(env.DB, user.did, app.did))?.route).toBe('telegram');
});

it('no grant at all: denied even for reads', async () => {
  const app = await makeIdentity('did:plc:mgmt-nogrant-app');
  const user = await makeIdentity('did:plc:mgmt-nogrant-user');
  mockPlc(app);
  mockPlc(user);
  const res = await dualCall(GETROUTING, app, user);
  expect(res.status).toBe(403);
});

// --- revokeSelf / muteSelf (self-write) ------------------------------------

it('revokeSelf: denied when undesignated, deletes the grant when designated', async () => {
  const { app, user } = await plain('mgmt-revoke');
  const denied = await dualCall(REVOKESELF, app, user);
  expect(denied.status).toBe(403);
  expect(await q.getGrant(env.DB, user.did, app.did)).not.toBeNull();

  await designate(user.did, app.did, 'self');
  const ok = await dualCall(REVOKESELF, app, user);
  expect(ok.status).toBe(200);
  expect(await q.getGrant(env.DB, user.did, app.did)).toBeNull();
});

it('muteSelf: a designated app can mute itself', async () => {
  const { app, user } = await plain('mgmt-mute');
  await designate(user.did, app.did, 'self');
  const res = await dualCall(MUTESELF, app, user, { muted: true });
  expect(res.status).toBe(200);
  expect((await q.getGrant(env.DB, user.did, app.did))?.muted).toBe(1);
});

it('a `full` designation also satisfies self-scoped writes', async () => {
  const { app, user } = await plain('mgmt-full');
  await designate(user.did, app.did, 'full');
  const res = await dualCall(SETROUTING, app, user, { route: 'push' });
  expect(res.status).toBe(200);
});
