import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';

import * as q from '../src/db/queries';
import * as ops from '../src/rpc/ops';

const SENDER = 'did:plc:routesender' as Did;

async function grantWithCategory(user: Did, category = 'mention'): Promise<void> {
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
    category,
    description: null,
    lastSeen: Date.now(),
  });
}

it('getRouting: app-wide route defaults to "default" and categories inherit "app"', async () => {
  const user = 'did:plc:routing1' as Did;
  await grantWithCategory(user);
  const cfg = await ops.getRouting(env, user);
  expect(cfg.defaultRoute).toBe('push');
  const app = cfg.apps.find((a) => a.sender === SENDER);
  expect(app?.route).toBe('default');
  expect(app?.categories[0]?.route).toBe('app');
});

it('getRouting: a granted app with no categories still appears (for app-wide routing)', async () => {
  const user = 'did:plc:routingNoCat' as Did;
  await q.ensureUser(env.DB, user, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: user,
    senderDid: SENDER,
    grantedAt: Date.now(),
    title: 'Bsky',
    description: null,
    iconUrl: null,
  });
  const app = (await ops.getRouting(env, user)).apps.find((a) => a.sender === SENDER);
  expect(app).toBeTruthy();
  expect(app?.categories).toHaveLength(0);
  expect(app?.route).toBe('default');
});

it('setAppRouting overrides the app-wide route and reverts to default', async () => {
  const user = 'did:plc:routingApp' as Did;
  await grantWithCategory(user);
  await ops.setAppRouting(env, user, SENDER, 'telegram');
  expect((await ops.getRouting(env, user)).apps[0]?.route).toBe('telegram');
  await ops.setAppRouting(env, user, SENDER, 'default');
  expect((await ops.getRouting(env, user)).apps[0]?.route).toBe('default');
});

it('setRouting overrides a category and reverts to "app"', async () => {
  const user = 'did:plc:routingCat' as Did;
  await grantWithCategory(user);
  await ops.setRouting(env, user, SENDER, 'mention', 'push+telegram');
  expect((await ops.getRouting(env, user)).apps[0]?.categories[0]?.route).toBe('push+telegram');
  await ops.setRouting(env, user, SENDER, 'mention', 'app');
  expect((await ops.getRouting(env, user)).apps[0]?.categories[0]?.route).toBe('app');
});

it('setDefaultRoute updates the account-wide default', async () => {
  const user = 'did:plc:routingDef' as Did;
  await ops.setDefaultRoute(env, user, 'telegram');
  expect((await ops.getRouting(env, user)).defaultRoute).toBe('telegram');
});

it('settings: autoAllow defaults to "trusted" and updateSettings changes it', async () => {
  const user = 'did:plc:routingAA' as Did;
  expect((await ops.getSettings(env, user)).autoAllow).toBe('trusted');
  await ops.updateSettings(env, user, { autoAllow: 'all' });
  expect((await ops.getSettings(env, user)).autoAllow).toBe('all');
  await ops.updateSettings(env, user, { autoAllow: 'none' });
  expect((await ops.getSettings(env, user)).autoAllow).toBe('none');
});
