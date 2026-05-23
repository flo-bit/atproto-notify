import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';

import * as q from '../src/db/queries';
import * as ops from '../src/rpc/ops';

const SENDER = 'did:plc:inboxsender' as Did;

async function seed(user: Did, id: string, createdAt: number, actors: string[] | null): Promise<void> {
  await q.insertNotification(env.DB, {
    id,
    recipientDid: user,
    senderDid: SENDER,
    category: 'mention',
    title: id,
    body: 'body',
    uri: null,
    actors,
    createdAt,
  });
}

it('listNotifications returns newest-first with actors and an unread count', async () => {
  const user = 'did:plc:inbox1' as Did;
  await seed(user, 'n-a', 1000, ['alice.test']);
  await seed(user, 'n-b', 2000, null);

  const res = await ops.listNotifications(env, user);

  expect(res.notifications.map((n) => n.id)).toEqual(['n-b', 'n-a']);
  expect(res.notifications[1]?.actors).toEqual(['alice.test']);
  expect(res.notifications[0]?.read).toBe(false);
  expect(res.unread).toBe(2);
});

it('markRead({ ids }) marks those; markRead({ all }) clears the rest', async () => {
  const user = 'did:plc:inbox2' as Did;
  await seed(user, 'm1', 1000, null);
  await seed(user, 'm2', 2000, null);
  await seed(user, 'm3', 3000, null);

  expect((await ops.markRead(env, user, { ids: ['m1', 'm2'] })).marked).toBe(2);
  expect((await ops.listNotifications(env, user)).unread).toBe(1);

  expect((await ops.markRead(env, user, { all: true })).marked).toBe(1);
  expect((await ops.listNotifications(env, user)).unread).toBe(0);
});
