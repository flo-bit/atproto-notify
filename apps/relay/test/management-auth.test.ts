import type { Did } from '@atcute/lexicons';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import worker from '../src/index';

import {
  addPush,
  addTelegram,
  addVerifiedEmail,
  installFetchMock,
  makeIdentity,
  makeJwt,
  mockPlc,
  xrpcPost,
  type TestIdentity,
} from './helpers';

beforeAll(() => {
  installFetchMock();
});

const SETROUTING = 'pub.atmo.notify.setRouting'; // self-write
const GETROUTING = 'pub.atmo.notify.getRouting'; // self-read
const REVOKESELF = 'pub.atmo.notify.revokeSelf'; // self-write
const MUTESELF = 'pub.atmo.notify.muteSelf'; // self-write
const ADDCATEGORY = 'pub.atmo.notify.addCategory'; // self-write
const SETCATEGORIES = 'pub.atmo.notify.setCategories'; // self-write
const REMOVECATEGORY = 'pub.atmo.notify.removeCategory'; // self-write
const GETCATEGORIES = 'pub.atmo.notify.getCategories'; // self-read

interface CategoryList {
  categories: { id: string; title?: string; route: string }[];
}

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

/** Granted and explicitly designated 'none' (no management access). New grants
 *  default to 'self', so pin it to 'none' to exercise the no-access tier. */
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
  await q.setGrantManage(env.DB, user.did, app.did, 'none');
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

it('a fresh grant defaults to self-management', async () => {
  const user = await makeIdentity('did:plc:mgmt-default-user');
  const app = await makeIdentity('did:plc:mgmt-default-app');
  await q.upsertGrant(env.DB, {
    recipientDid: user.did,
    senderDid: app.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null,
  });
  expect((await q.getGrant(env.DB, user.did, app.did))?.manage).toBe('self');
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

// --- category management (federated, self-scoped) --------------------------

it('addCategory is a write: denied undesignated, allowed once designated `self`', async () => {
  const { app, user } = await plain('cat-fed-write');
  const denied = await dualCall(ADDCATEGORY, app, user, { id: 'wh', title: 'WH' });
  expect(denied.status).toBe(403);

  await designate(user.did, app.did, 'self');
  const ok = await dualCall(ADDCATEGORY, app, user, { id: 'wh', title: 'WH', route: 'inbox' });
  expect(ok.status).toBe(200);
});

it('addCategory rejects an invalid route', async () => {
  const { app, user } = await plain('cat-fed-badroute');
  await designate(user.did, app.did, 'self');
  const res = await dualCall(ADDCATEGORY, app, user, { id: 'wh', route: 'nope!' });
  expect(res.status).toBe(400);
});

it('setCategories full-sync + getCategories over XRPC (only this app’s)', async () => {
  const { app, user } = await plain('cat-fed-sync');
  await designate(user.did, app.did, 'self');

  await dualCall(SETCATEGORIES, app, user, {
    categories: [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B', route: 'push' },
    ],
  });
  let data = (await (await dualCall(GETCATEGORIES, app, user)).json()) as CategoryList;
  expect(data.categories.map((c) => c.id).sort()).toEqual(['a', 'b']);

  await dualCall(SETCATEGORIES, app, user, { categories: [{ id: 'a', title: 'A2' }] });
  data = (await (await dualCall(GETCATEGORIES, app, user)).json()) as CategoryList;
  expect(data.categories.map((c) => c.id)).toEqual(['a']);
  expect(data.categories[0]?.title).toBe('A2');
});

it('removeCategory over XRPC', async () => {
  const { app, user } = await plain('cat-fed-remove');
  await designate(user.did, app.did, 'self');
  await dualCall(ADDCATEGORY, app, user, { id: 'gone', title: 'G' });
  const res = await dualCall(REMOVECATEGORY, app, user, { id: 'gone' });
  expect(res.status).toBe(200);
  expect((await (await dualCall(GETCATEGORIES, app, user)).json()) as CategoryList).toEqual({
    categories: [],
  });
});

it('getRouting returns the target catalog with privacy-safe labels', async () => {
  const { app, user } = await plain('mgmt-targets');
  await addVerifiedEmail(env.DB, user.did, 'secret@example.com');
  await addTelegram(env.DB, user.did, '424242', 'secrethandle');
  await addPush(env.DB, user.did, 'https://push.example/dev', 'Chrome · macOS');

  const res = await dualCall(GETROUTING, app, user);
  expect(res.status).toBe(200);
  const data = (await res.json()) as { targets: { type: string; id: string; label: string }[] };
  const labelByType = Object.fromEntries(data.targets.map((t) => [t.type, t.label]));

  expect(labelByType.email).toBe('Email'); // raw address NOT exposed
  expect(labelByType.telegram).toBe('Telegram'); // raw @handle NOT exposed
  expect(labelByType.push).toBe('Chrome · macOS'); // device label is fine
  const dump = JSON.stringify(data.targets);
  expect(dump).not.toContain('secret@example.com');
  expect(dump).not.toContain('secrethandle');
});

it('getRouting exposes a user-chosen target name once renamed', async () => {
  const { app, user } = await plain('mgmt-targets-named');
  const emailId = await addVerifiedEmail(env.DB, user.did, 'me@example.com');
  await q.renameDeliveryTargetById(env.DB, user.did, emailId, 'Work');

  const res = await dualCall(GETROUTING, app, user);
  const data = (await res.json()) as { targets: { type: string; label: string }[] };
  expect(data.targets.find((t) => t.type === 'email')?.label).toBe('Work');
});
