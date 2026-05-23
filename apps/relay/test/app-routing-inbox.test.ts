import type { Did } from '@atcute/lexicons';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import worker from '../src/index';

import { installFetchMock, makeIdentity, makeJwt, mockPlc, xrpcPost, type TestIdentity } from './helpers';

beforeAll(() => {
  installFetchMock();
});

const SETR = 'pub.atmo.notify.setRouting';
const GETR = 'pub.atmo.notify.getRouting';
const LIST = 'pub.atmo.notify.listNotifications';
const MARK = 'pub.atmo.notify.markRead';

async function call(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/** Mint the app bearer (header) + the user consent token (body), both scoped to `lxm`. */
async function dualCall(
  lxm: string,
  appId: TestIdentity,
  userId: TestIdentity,
  body: Record<string, unknown> = {},
): Promise<Response> {
  const appJwt = await makeJwt(appId, { lxm });
  const userToken = await makeJwt(userId, { lxm });
  return call(xrpcPost(lxm, appJwt, { userToken, ...body }));
}

function grant(recipient: Did, sender: Did): Promise<void> {
  return q.upsertGrant(env.DB, {
    recipientDid: recipient,
    senderDid: sender,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null,
  });
}

/** A mock app + user identity pair (both DID docs resolvable), with the app granted. */
async function granted(tag: string): Promise<{ app: TestIdentity; user: TestIdentity }> {
  const app = await makeIdentity(`did:plc:${tag}-app`);
  const user = await makeIdentity(`did:plc:${tag}-user`);
  mockPlc(app);
  mockPlc(user);
  await grant(user.did, app.did);
  return { app, user };
}

// --- setRouting ------------------------------------------------------------

it('setRouting: 403 without a grant', async () => {
  const app = await makeIdentity('did:plc:srt-ng-app');
  const user = await makeIdentity('did:plc:srt-ng-user');
  mockPlc(app);
  mockPlc(user);

  const res = await dualCall(SETR, app, user, { route: 'telegram' });

  expect(res.status).toBe(403);
});

it('setRouting: 403 when the user token is the app itself', async () => {
  const app = await makeIdentity('did:plc:srt-self-app');
  mockPlc(app);
  // Forge the consent token from the app's own key → userDid === senderDid.
  const appJwt = await makeJwt(app, { lxm: SETR });
  const userToken = await makeJwt(app, { lxm: SETR });

  const res = await call(xrpcPost(SETR, appJwt, { userToken, route: 'off' }));

  expect(res.status).toBe(403);
});

it('setRouting: 400 when userToken is missing', async () => {
  const app = await makeIdentity('did:plc:srt-nouser-app');
  mockPlc(app);
  const appJwt = await makeJwt(app, { lxm: SETR });

  const res = await call(xrpcPost(SETR, appJwt, { route: 'off' }));

  expect(res.status).toBe(400);
});

it('setRouting: 401 when the user token is scoped to another method', async () => {
  const { app, user } = await granted('srt-lxm');
  const appJwt = await makeJwt(app, { lxm: SETR });
  const userToken = await makeJwt(user, { lxm: 'pub.atmo.notify.send' });

  const res = await call(xrpcPost(SETR, appJwt, { userToken, route: 'off' }));

  expect(res.status).toBe(401);
});

it('setRouting: writes app-wide + per-category routes scoped to the app', async () => {
  const { app, user } = await granted('srt-write');

  const res = await dualCall(SETR, app, user, {
    route: 'telegram',
    categories: [{ id: 'mention', route: 'off' }],
  });

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });
  expect((await q.getAppRoute(env.DB, user.did, app.did))?.route).toBe('telegram');
  expect((await q.getRoutingRoute(env.DB, user.did, app.did, 'mention'))?.route).toBe('off');
});

it("setRouting: 'default'/'app' clear existing overrides", async () => {
  const { app, user } = await granted('srt-clear');
  await q.upsertAppRoute(env.DB, user.did, app.did, 'telegram');
  await q.upsertRouting(env.DB, user.did, app.did, 'mention', 'off');

  const res = await dualCall(SETR, app, user, {
    route: 'default',
    categories: [{ id: 'mention', route: 'app' }],
  });

  expect(res.status).toBe(200);
  expect(await q.getAppRoute(env.DB, user.did, app.did)).toBeNull();
  expect(await q.getRoutingRoute(env.DB, user.did, app.did, 'mention')).toBeNull();
});

it('setRouting: 400 on an invalid route value', async () => {
  const { app, user } = await granted('srt-bad');
  const appJwt = await makeJwt(app, { lxm: SETR });
  const userToken = await makeJwt(user, { lxm: SETR });

  const res = await call(xrpcPost(SETR, appJwt, { userToken, route: 'carrier-pigeon' }));

  expect(res.status).toBe(400);
});

// --- getRouting ------------------------------------------------------------

it('getRouting: returns the app slice + account default', async () => {
  const { app, user } = await granted('getr');
  await q.ensureUser(env.DB, user.did, Date.now());
  await q.setDefaultRoute(env.DB, user.did, 'push+telegram');
  await q.upsertAppRoute(env.DB, user.did, app.did, 'telegram');
  await q.upsertAppCategory(env.DB, {
    recipientDid: user.did,
    senderDid: app.did,
    category: 'mention',
    description: 'Mentions',
    lastSeen: Date.now(),
  });
  await q.upsertRouting(env.DB, user.did, app.did, 'mention', 'off');

  const res = await dualCall(GETR, app, user);

  expect(res.status).toBe(200);
  const data = (await res.json()) as {
    route: string;
    defaultRoute: string;
    categories: { id: string; description?: string; route: string }[];
  };
  expect(data.route).toBe('telegram');
  expect(data.defaultRoute).toBe('push+telegram');
  expect(data.categories).toEqual([{ id: 'mention', description: 'Mentions', route: 'off' }]);
});

it('getRouting: defaults when nothing is configured', async () => {
  const { app, user } = await granted('getr-default');

  const res = await dualCall(GETR, app, user);

  expect(res.status).toBe(200);
  const data = (await res.json()) as { route: string; defaultRoute: string; categories: unknown[] };
  expect(data.route).toBe('default');
  expect(data.defaultRoute).toBe('push');
  expect(data.categories).toEqual([]);
});

// --- listNotifications -----------------------------------------------------

it('listNotifications: returns only the app’s own notifications, newest-first, with delivery', async () => {
  const { app, user } = await granted('list');
  const other: Did = 'did:plc:list-other';
  const t0 = Date.now();
  await q.insertNotification(env.DB, {
    id: 'list-n1',
    recipientDid: user.did,
    senderDid: app.did,
    category: 'mention',
    title: 'First',
    body: 'a',
    uri: null,
    actors: null,
    createdAt: t0 - 1000,
  });
  await q.insertNotification(env.DB, {
    id: 'list-n2',
    recipientDid: user.did,
    senderDid: app.did,
    category: null,
    title: 'Second',
    body: 'b',
    uri: 'https://example.com/x',
    actors: null,
    createdAt: t0,
  });
  await q.insertDeliveryLog(env.DB, {
    id: 'list-n2',
    recipientDid: user.did,
    senderDid: app.did,
    title: 'Second',
    deliveredCount: 2,
    createdAt: t0,
  });
  // A different app's notification to the same user must not leak.
  await q.insertNotification(env.DB, {
    id: 'list-n3',
    recipientDid: user.did,
    senderDid: other,
    category: null,
    title: 'Other',
    body: 'c',
    uri: null,
    actors: null,
    createdAt: t0,
  });

  const res = await dualCall(LIST, app, user, { limit: 50 });

  expect(res.status).toBe(200);
  const data = (await res.json()) as {
    notifications: { id: string; read: boolean; delivered?: number; uri?: string }[];
  };
  const ids = data.notifications.map((n) => n.id);
  expect(ids).toContain('list-n1');
  expect(ids).toContain('list-n2');
  expect(ids).not.toContain('list-n3');
  // Newest first.
  expect(ids.indexOf('list-n2')).toBeLessThan(ids.indexOf('list-n1'));
  const n2 = data.notifications.find((n) => n.id === 'list-n2');
  expect(n2?.read).toBe(false);
  expect(n2?.delivered).toBe(2);
  expect(n2?.uri).toBe('https://example.com/x');
});

// --- markRead --------------------------------------------------------------

it('markRead: marks all of the app’s notifications, leaving other apps untouched', async () => {
  const { app, user } = await granted('mark-all');
  const other: Did = 'did:plc:mark-other';
  for (const [id, sender] of [
    ['mark-n1', app.did],
    ['mark-n2', app.did],
    ['mark-n3', other],
  ] as const) {
    await q.insertNotification(env.DB, {
      id,
      recipientDid: user.did,
      senderDid: sender,
      category: null,
      title: id,
      body: 'x',
      uri: null,
      actors: null,
      createdAt: Date.now(),
    });
  }

  const res = await dualCall(MARK, app, user);

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ marked: 2 });
  const n1 = await env.DB.prepare('SELECT read_at FROM notifications WHERE id = ?')
    .bind('mark-n1')
    .first<{ read_at: number | null }>();
  const n3 = await env.DB.prepare('SELECT read_at FROM notifications WHERE id = ?')
    .bind('mark-n3')
    .first<{ read_at: number | null }>();
  expect(n1?.read_at).not.toBeNull();
  expect(n3?.read_at).toBeNull(); // other app's notification stays unread
});

it('markRead: marks only the given ids when provided', async () => {
  const { app, user } = await granted('mark-ids');
  for (const id of ['mark-i4', 'mark-i5']) {
    await q.insertNotification(env.DB, {
      id,
      recipientDid: user.did,
      senderDid: app.did,
      category: null,
      title: id,
      body: 'x',
      uri: null,
      actors: null,
      createdAt: Date.now(),
    });
  }

  const res = await dualCall(MARK, app, user, { ids: ['mark-i4'] });

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ marked: 1 });
  const i5 = await env.DB.prepare('SELECT read_at FROM notifications WHERE id = ?')
    .bind('mark-i5')
    .first<{ read_at: number | null }>();
  expect(i5?.read_at).toBeNull();
});
