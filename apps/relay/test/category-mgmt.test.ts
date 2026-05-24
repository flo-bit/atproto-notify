import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';

import * as q from '../src/db/queries';
import * as ops from '../src/rpc/ops';

const APP = 'did:plc:catapp' as Did;

it('addCategory declares a category with title + an optional initial route', async () => {
  const user = 'did:plc:cat-user1' as Did;
  await ops.addCategory(env, user, APP, { id: 'wh_1', title: 'My Webhook', route: 'inbox' });
  const { categories } = await ops.getCategories(env, user, APP);
  expect(categories).toEqual([{ id: 'wh_1', title: 'My Webhook', route: 'inbox' }]);
});

it('addCategory without a route leaves it inheriting the app route', async () => {
  const user = 'did:plc:cat-noroute' as Did;
  await ops.addCategory(env, user, APP, { id: 'wh_x', title: 'X' });
  expect((await ops.getCategories(env, user, APP)).categories[0]).toMatchObject({
    id: 'wh_x',
    route: 'app',
  });
});

it('setCategories full-sync upserts the listed ones and prunes the rest (with routing)', async () => {
  const user = 'did:plc:cat-sync' as Did;
  await ops.setCategories(env, user, APP, [
    { id: 'a', title: 'A', route: 'push' },
    { id: 'b', title: 'B' },
  ]);
  expect((await q.getRoutingRoute(env.DB, user, APP, 'a'))?.route).toBe('push');

  // Re-sync to just [a]; b (and its routing) is pruned, a's route is preserved.
  await ops.setCategories(env, user, APP, [{ id: 'a', title: 'A renamed' }]);
  const { categories } = await ops.getCategories(env, user, APP);
  expect(categories.map((c) => c.id)).toEqual(['a']);
  expect(categories[0]?.title).toBe('A renamed');
  expect(await q.getRoutingRoute(env.DB, user, APP, 'b')).toBeNull();
  expect((await q.getRoutingRoute(env.DB, user, APP, 'a'))?.route).toBe('push');
});

it('removeCategory deletes the category and its routing', async () => {
  const user = 'did:plc:cat-remove' as Did;
  await ops.addCategory(env, user, APP, { id: 'gone', title: 'Gone', route: 'telegram' });
  expect((await ops.removeCategory(env, user, APP, 'gone')).removed).toBe(true);
  expect((await ops.getCategories(env, user, APP)).categories).toHaveLength(0);
  expect(await q.getRoutingRoute(env.DB, user, APP, 'gone')).toBeNull();
});

it('categories are per-user: one user never sees another’s', async () => {
  const userA = 'did:plc:cat-A' as Did;
  const userB = 'did:plc:cat-B' as Did;
  await ops.addCategory(env, userA, APP, { id: 'secret', title: 'A only' });
  const { categories } = await ops.getCategories(env, userB, APP);
  expect(categories.find((c) => c.id === 'secret')).toBeUndefined();
});

it('revoke cascades: the app’s routing + categories are removed', async () => {
  const user = 'did:plc:cat-revoke' as Did;
  await q.upsertGrant(env.DB, {
    recipientDid: user,
    senderDid: APP,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null,
  });
  await ops.setAppRouting(env, user, APP, 'push');
  await ops.addCategory(env, user, APP, { id: 'c', title: 'C', route: 'telegram' });

  await ops.revoke(env, user, { sender: APP });

  expect(await q.getAppRoute(env.DB, user, APP)).toBeNull();
  expect(await q.getRoutingRoute(env.DB, user, APP, 'c')).toBeNull();
  expect((await ops.getCategories(env, user, APP)).categories).toHaveLength(0);
});

it('getRouting surfaces the category title', async () => {
  const user = 'did:plc:cat-routing' as Did;
  await q.upsertGrant(env.DB, {
    recipientDid: user,
    senderDid: APP,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null,
  });
  await ops.addCategory(env, user, APP, { id: 'wh', title: 'Webhook Name', route: 'push' });

  const routing = await ops.getRouting(env, user);
  const cat = routing.apps.find((a) => a.sender === APP)?.categories.find((c) => c.category === 'wh');
  expect(cat).toMatchObject({ category: 'wh', title: 'Webhook Name', route: 'push' });
});
