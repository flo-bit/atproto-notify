import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import * as ops from '../src/rpc/ops';

import { installFetchMock, makeBskyProfileMock } from './helpers';

const SENDER = 'did:plc:inboxsender' as Did;

beforeEach(() => {
  // Actor avatars resolve via the Bluesky AppView; keep it offline + deterministic.
  installFetchMock();
  makeBskyProfileMock({ handle: 'alice.test', avatar: 'https://cdn.test/alice.jpg' });
});

async function seed(
  user: Did,
  id: string,
  createdAt: number,
  actors: q.NotificationActorRecord[] | null,
): Promise<void> {
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

it('listNotifications returns newest-first; actors resolve avatar + handle from the DID', async () => {
  const user = 'did:plc:inbox1' as Did;
  await seed(user, 'n-a', 1000, [{ did: 'did:plc:alice' }]);
  await seed(user, 'n-b', 2000, null);

  const res = await ops.listNotifications(env, user);

  expect(res.notifications.map((n) => n.id)).toEqual(['n-b', 'n-a']);
  expect(res.notifications[1]?.actors).toEqual([
    { did: 'did:plc:alice', handle: 'alice.test', avatar: 'https://cdn.test/alice.jpg', url: undefined },
  ]);
  expect(res.notifications[0]?.read).toBe(false);
  expect(res.unread).toBe(2);
});

it('a sender-supplied avatarImage/handle is used as-is (no profile fetch)', async () => {
  const user = 'did:plc:inbox-av' as Did;
  await seed(user, 'n-c', 1000, [
    { did: 'did:plc:bob', handle: 'bob.custom', avatarImage: 'https://img.test/bob.png', url: 'https://bob.example' },
  ]);

  const res = await ops.listNotifications(env, user);

  expect(res.notifications[0]?.actors).toEqual([
    { did: 'did:plc:bob', handle: 'bob.custom', avatar: 'https://img.test/bob.png', url: 'https://bob.example' },
  ]);
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

it('clearNotificationsFromSender deletes only that app’s notifications', async () => {
  const user = 'did:plc:inbox-clear' as Did;
  const other: Did = 'did:plc:inbox-other-sender';
  await seed(user, 'c1', 1000, null);
  await seed(user, 'c2', 2000, null);
  await q.insertNotification(env.DB, {
    id: 'c-other',
    recipientDid: user,
    senderDid: other,
    category: null,
    title: 'keep',
    body: 'b',
    uri: null,
    actors: null,
    createdAt: 3000,
  });

  expect((await ops.clearNotificationsFromSender(env, user, SENDER)).deleted).toBe(2);

  const rest = await ops.listNotifications(env, user);
  expect(rest.notifications.map((n) => n.id)).toEqual(['c-other']);
});
