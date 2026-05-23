import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';

import * as q from '../src/db/queries';
import * as ops from '../src/rpc/ops';

// grant/revoke are no longer XRPC endpoints — they're first-party management ops
// behind the service binding. The binding is the auth boundary, so these tests
// exercise the operation logic directly (the `did` is the authenticated user).
const SENDER: Did = 'did:plc:grantsender';

it('grant consumes the pending request and copies its metadata onto the grant', async () => {
  const user: Did = 'did:plc:grantuser';
  await q.insertPending(env.DB, {
    id: 'req-1',
    recipientDid: user,
    senderDid: SENDER,
    title: 'Bookhive',
    description: 'New comments on your books',
    iconUrl: 'https://bookhive.example/icon.png',
    createdAt: Date.now(),
    expiresAt: Date.now() + 1_000_000,
  });

  const out = await ops.grant(env, user, { sender: SENDER, requestId: 'req-1' });

  expect(out).toEqual({ granted: true });
  expect(await q.getPendingById(env.DB, 'req-1')).toBeNull();

  const grant = await q.getGrant(env.DB, user, SENDER);
  expect(grant).not.toBeNull();
  expect(grant?.title).toBe('Bookhive');
  expect(grant?.description).toBe('New comments on your books');
  expect(grant?.icon_url).toBe('https://bookhive.example/icon.png');
});

it('revoke removes the grant', async () => {
  const user: Did = 'did:plc:revokeuser';
  await q.upsertGrant(env.DB, {
    recipientDid: user,
    senderDid: SENDER,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null,
  });

  const out = await ops.revoke(env, user, { sender: SENDER });

  expect(out).toEqual({ revoked: true });
  expect(await q.getGrant(env.DB, user, SENDER)).toBeNull();
});
