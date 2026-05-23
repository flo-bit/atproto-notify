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
  return new Request(`https://notifs.atmo.tools/telegram/webhook/${secret}`, {
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
  const channel = await q.getChannelByPlatformUser(env.DB, 'telegram', '999');
  expect(channel?.did).toBe(did);
  expect(channel?.display_name).toBe('alice');
  expect(await q.getLinkToken(env.DB, 'tok-valid')).toBeNull();
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
  expect(await q.getChannelByPlatformUser(env.DB, 'telegram', '888')).toBeNull();
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
  expect(await q.getChannelByPlatformUser(env.DB, 'telegram', '777')).toBeNull();
});

it('rejects a webhook with the wrong secret', async () => {
  const res = await call(webhook({ update_id: 4 }, 'wrong-secret'));
  expect(res.status).toBe(403);
});
