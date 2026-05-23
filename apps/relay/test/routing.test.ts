import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';

import * as q from '../src/db/queries';
import * as ops from '../src/rpc/ops';

const SENDER = 'did:plc:routesender' as Did;

it('getRouting lists granted apps with discovered categories and the default route', async () => {
  const user = 'did:plc:routing1' as Did;
  await q.ensureUser(env.DB, user, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: user,
    senderDid: SENDER,
    grantedAt: Date.now(),
    title: 'Bsky',
    description: null,
    iconUrl: null,
  });
  await q.upsertAppCategory(env.DB, {
    recipientDid: user,
    senderDid: SENDER,
    category: 'mention',
    description: 'Mentions',
    lastSeen: Date.now(),
  });
  await q.upsertAppCategory(env.DB, {
    recipientDid: user,
    senderDid: SENDER,
    category: 'reply',
    description: null,
    lastSeen: Date.now(),
  });

  const cfg = await ops.getRouting(env, user);

  expect(cfg.defaultRoute).toBe('push');
  const app = cfg.apps.find((a) => a.sender === SENDER);
  expect(app?.title).toBe('Bsky');
  expect(app?.categories.map((c) => c.category).sort()).toEqual(['mention', 'reply']);
  expect(app?.categories.every((c) => c.route === 'default')).toBe(true);
});

it('setRouting overrides a category route and reverts to default', async () => {
  const user = 'did:plc:routing2' as Did;
  await q.ensureUser(env.DB, user, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: user,
    senderDid: SENDER,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null,
  });
  await q.upsertAppCategory(env.DB, {
    recipientDid: user,
    senderDid: SENDER,
    category: 'mention',
    description: null,
    lastSeen: Date.now(),
  });

  await ops.setRouting(env, user, SENDER, 'mention', 'push+telegram');
  expect((await ops.getRouting(env, user)).apps[0]?.categories[0]?.route).toBe('push+telegram');

  await ops.setRouting(env, user, SENDER, 'mention', 'default');
  expect((await ops.getRouting(env, user)).apps[0]?.categories[0]?.route).toBe('default');
});

it('setDefaultRoute updates the user-wide default', async () => {
  const user = 'did:plc:routing3' as Did;
  await ops.setDefaultRoute(env, user, 'telegram');
  expect((await ops.getRouting(env, user)).defaultRoute).toBe('telegram');
});
