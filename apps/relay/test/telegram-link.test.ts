import type { Did } from '@atcute/lexicons';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import worker from '../src/index';

import { installFetchMock, mockTelegramOk } from './helpers';

const SECRET = 'test-webhook-secret';

beforeAll(() => {
  installFetchMock();
  mockTelegramOk();
});

async function call(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function webhook(update: unknown, secret = SECRET): Request {
  return new Request(`https://relay.atmo.pub/telegram/webhook/${secret}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update),
  });
}

it('/start <valid token> links the Telegram channel and consumes the token', async () => {
  const did: Did = 'did:plc:tglinkuser';
  await q.insertLinkToken(env.DB, {
    token: 'tok-valid',
    did,
    platform: 'telegram',
    expiresAt: Date.now() + 600_000,
  });

  const res = await call(
    webhook({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 999, type: 'private' },
        from: { id: 999, username: 'alice' },
        text: '/start tok-valid',
      },
    }),
  );

  expect(res.status).toBe(200);
  const channel = await q.getDeliveryTargetByRef(env.DB, 'telegram', '999');
  expect(channel?.did).toBe(did);
  expect(channel?.label).toBe('alice');
  expect(await q.getLinkToken(env.DB, 'tok-valid')).toBeNull();
});

it('/start applies a label carried on the link token and marks it named', async () => {
  const did: Did = 'did:plc:tglabeled';
  await q.insertLinkToken(env.DB, {
    token: 'tok-labeled',
    did,
    platform: 'telegram',
    label: 'Work phone',
    expiresAt: Date.now() + 600_000,
  });

  const res = await call(
    webhook({
      update_id: 5,
      message: {
        message_id: 5,
        chat: { id: 555, type: 'private' },
        from: { id: 555, username: 'carol' },
        text: '/start tok-labeled',
      },
    }),
  );

  expect(res.status).toBe(200);
  const channel = await q.getDeliveryTargetByRef(env.DB, 'telegram', '555');
  expect(channel?.label).toBe('Work phone'); // user label, not the @username
  expect(channel?.named).toBe(1);
});

it('/start <expired token> does not link', async () => {
  const did: Did = 'did:plc:tgexpired';
  await q.insertLinkToken(env.DB, {
    token: 'tok-expired',
    did,
    platform: 'telegram',
    expiresAt: Date.now() - 1000,
  });

  const res = await call(
    webhook({
      update_id: 2,
      message: {
        message_id: 2,
        chat: { id: 888, type: 'private' },
        from: { id: 888, username: 'bob' },
        text: '/start tok-expired',
      },
    }),
  );

  expect(res.status).toBe(200);
  expect(await q.getDeliveryTargetByRef(env.DB, 'telegram', '888')).toBeNull();
});

it('/start with no argument responds 200 without linking', async () => {
  const res = await call(
    webhook({
      update_id: 3,
      message: {
        message_id: 3,
        chat: { id: 777, type: 'private' },
        from: { id: 777 },
        text: '/start',
      },
    }),
  );

  expect(res.status).toBe(200);
  expect(await q.getDeliveryTargetByRef(env.DB, 'telegram', '777')).toBeNull();
});

it('rejects a webhook with the wrong secret', async () => {
  const res = await call(webhook({ update_id: 4 }, 'wrong-secret'));
  expect(res.status).toBe(403);
});
