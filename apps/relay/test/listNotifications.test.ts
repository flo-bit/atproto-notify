import type { Did } from '@atcute/lexicons';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import worker from '../src/index';

import { installFetchMock, makeIdentity, makeJwt, mockPlc, type TestIdentity } from './helpers';

beforeAll(() => {
  installFetchMock();
});

const LXM = 'tools.atmo.notifs.listNotifications';

async function call(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function getReq(query: string, jwt: string): Request {
  return new Request(`https://notifs.atmo.tools/xrpc/${LXM}${query}`, {
    headers: { authorization: `Bearer ${jwt}` },
  });
}

async function logNotif(
  recipient: Did,
  sender: string,
  id: string,
  createdAt: number,
  extra: { title?: string; body?: string; uri?: string | null } = {},
): Promise<void> {
  await q.insertDeliveryLog(env.DB, {
    id,
    recipientDid: recipient,
    senderDid: sender as Did,
    title: extra.title ?? `title-${id}`,
    body: extra.body ?? `body-${id}`,
    uri: extra.uri ?? null,
    deliveredCount: 1,
    createdAt,
  });
}

async function jwtFor(user: TestIdentity): Promise<string> {
  return makeJwt(user, { lxm: LXM });
}

it('paginates newest-first via cursor', async () => {
  const user = await makeIdentity('did:plc:notif1');
  mockPlc(user);
  await logNotif(user.did, 'did:plc:s1', 'n0', 1000);
  await logNotif(user.did, 'did:plc:s1', 'n1', 1001);
  await logNotif(user.did, 'did:plc:s1', 'n2', 1002);

  const page1 = (await (await call(getReq('?limit=2', await jwtFor(user)))).json()) as {
    notifications: Array<{ id: string }>;
    cursor?: string;
  };
  expect(page1.notifications.map((n) => n.id)).toEqual(['n2', 'n1']);
  expect(page1.cursor).toBeTypeOf('string');

  const page2 = (await (
    await call(getReq(`?limit=2&cursor=${encodeURIComponent(page1.cursor!)}`, await jwtFor(user)))
  ).json()) as { notifications: Array<{ id: string }>; cursor?: string };
  expect(page2.notifications.map((n) => n.id)).toEqual(['n0']);
  expect(page2.cursor).toBeUndefined();
});

it('filters by senderDid', async () => {
  const user = await makeIdentity('did:plc:notif2');
  mockPlc(user);
  await logNotif(user.did, 'did:plc:sa', 'a', 1);
  await logNotif(user.did, 'did:plc:sb', 'b', 2);
  await logNotif(user.did, 'did:plc:sa', 'c', 3);

  const res = (await (
    await call(getReq('?senderDid=did:plc:sa', await jwtFor(user)))
  ).json()) as { notifications: Array<{ id: string; sender: string }> };
  expect(res.notifications.map((n) => n.id)).toEqual(['c', 'a']);
  expect(res.notifications.every((n) => n.sender === 'did:plc:sa')).toBe(true);
});

it('joins the cached sender profile and returns full content', async () => {
  const user = await makeIdentity('did:plc:notif3');
  mockPlc(user);
  await q.upsertSender(env.DB, {
    did: 'did:plc:sp' as Did,
    handle: 'sender.example',
    displayName: 'The Sender',
    avatarUrl: 'https://cdn.example/a.png',
    profileFetchedAt: 1,
  });
  await logNotif(user.did, 'did:plc:sp', 'p1', 5, {
    title: 'Hi',
    body: 'there',
    uri: 'https://app.example/x',
  });

  const res = (await (await call(getReq('', await jwtFor(user)))).json()) as {
    notifications: Array<Record<string, unknown>>;
  };
  const n = res.notifications.find((x) => x.id === 'p1');
  expect(n).toMatchObject({
    id: 'p1',
    sender: 'did:plc:sp',
    senderHandle: 'sender.example',
    senderDisplayName: 'The Sender',
    senderAvatar: 'https://cdn.example/a.png',
    title: 'Hi',
    body: 'there',
    uri: 'https://app.example/x',
  });
});

it('only returns the authenticated user’s notifications', async () => {
  const me = await makeIdentity('did:plc:notifme');
  const other = await makeIdentity('did:plc:notifother');
  mockPlc(me);
  await logNotif(me.did, 'did:plc:sx', 'mine', 1);
  await logNotif(other.did, 'did:plc:sx', 'theirs', 2);

  const res = (await (await call(getReq('', await jwtFor(me)))).json()) as {
    notifications: Array<{ id: string }>;
  };
  expect(res.notifications.map((n) => n.id)).toEqual(['mine']);
});
