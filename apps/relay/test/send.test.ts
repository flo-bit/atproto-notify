import type { Did } from '@atcute/lexicons';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import worker from '../src/index';

import { installFetchMock, makeIdentity, makeJwt, mockPlc, mockTelegramOk, xrpcPost } from './helpers';

beforeAll(() => {
  installFetchMock();
  mockTelegramOk();
});

const SEND = 'tools.atmo.notifs.send';
const RECIPIENT: Did = 'did:plc:sendrecipient';

async function call(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function send(jwt: string): Request {
  return xrpcPost(SEND, jwt, { recipient: RECIPIENT, title: 'Hello', body: 'World' });
}

it('returns 403 when no grant exists', async () => {
  const sender = await makeIdentity('did:plc:sendnogrant');
  mockPlc(sender);
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(send(jwt));

  expect(res.status).toBe(403);
});

it('accepts but delivers to nobody when there is a grant but no channel', async () => {
  const sender = await makeIdentity('did:plc:sendnochannel');
  mockPlc(sender);
  await q.upsertGrant(env.DB, {
    recipientDid: RECIPIENT,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(send(jwt));

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ delivered: 0 });
});

it('enqueues and reports delivered=1 with a linked channel', async () => {
  const sender = await makeIdentity('did:plc:sendchannel');
  mockPlc(sender);
  await q.upsertGrant(env.DB, {
    recipientDid: RECIPIENT,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  await q.upsertChannel(env.DB, {
    did: RECIPIENT,
    platform: 'telegram',
    platformUserId: '12345',
    displayName: null,
    linkedAt: Date.now(),
  });
  // Default route is 'push'; opt this recipient into Telegram so the channel fires.
  await q.ensureUser(env.DB, RECIPIENT, Date.now());
  await q.setDefaultRoute(env.DB, RECIPIENT, 'push+telegram');
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(send(jwt));

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ delivered: 1 });

  const log = await env.DB.prepare('SELECT delivered_count FROM delivery_log WHERE recipient_did = ?')
    .bind(RECIPIENT)
    .first<{ delivered_count: number }>();
  expect(log?.delivered_count).toBe(1);
});

it('records the notification in the inbox', async () => {
  const sender = await makeIdentity('did:plc:sendinbox');
  mockPlc(sender);
  await q.upsertGrant(env.DB, {
    recipientDid: RECIPIENT,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  const jwt = await makeJwt(sender, { lxm: SEND });

  await call(send(jwt));

  const rows = await q.listNotificationsForRecipient(env.DB, RECIPIENT, 50);
  expect(rows.some((r) => r.sender_did === sender.did && r.title === 'Hello')).toBe(true);
});

it('per-category routing gates which channels fire', async () => {
  const sender = await makeIdentity('did:plc:sendroute');
  mockPlc(sender);
  const recip: Did = 'did:plc:routerecipient';
  await q.ensureUser(env.DB, recip, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: recip,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  await q.upsertChannel(env.DB, {
    did: recip,
    platform: 'telegram',
    platformUserId: '99999',
    displayName: null,
    linkedAt: Date.now()
  });
  // Default 'push' would skip Telegram, but this category is routed to Telegram.
  await q.setDefaultRoute(env.DB, recip, 'push');
  await q.upsertRouting(env.DB, recip, sender.did, 'mention', 'telegram');
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(
    xrpcPost(SEND, jwt, { recipient: recip, title: 'Hi', body: 'B', category: 'mention' })
  );

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ delivered: 1 });
});

it('accepts silently with delivered=0 when the grant is muted', async () => {
  const sender = await makeIdentity('did:plc:sendmuted');
  mockPlc(sender);
  await q.upsertGrant(env.DB, {
    recipientDid: RECIPIENT,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  await q.setGrantMuted(env.DB, RECIPIENT, sender.did, true);
  await q.upsertChannel(env.DB, {
    did: RECIPIENT,
    platform: 'telegram',
    platformUserId: '54321',
    displayName: null,
    linkedAt: Date.now(),
  });
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(send(jwt));

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ delivered: 0 });
});
