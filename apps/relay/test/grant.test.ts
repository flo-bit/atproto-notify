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
  // New grants default to self-management ('self'), set explicitly (not via the
  // column default) so it holds even on an older DB.
  expect(grant?.manage).toBe('self');
});

it('a re-grant keeps the user-chosen manage capability', async () => {
  const user: Did = 'did:plc:regrantmanage';
  await q.upsertGrant(env.DB, {
    recipientDid: user,
    senderDid: SENDER,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null,
  });
  // User downgrades to 'none'.
  await q.setGrantManage(env.DB, user, SENDER, 'none');
  // Re-granting (e.g. the app re-requests) must not silently restore 'self'.
  await q.upsertGrant(env.DB, {
    recipientDid: user,
    senderDid: SENDER,
    grantedAt: Date.now(),
    title: null,
    description: null,
    iconUrl: null,
  });
  expect((await q.getGrant(env.DB, user, SENDER))?.manage).toBe('none');
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
