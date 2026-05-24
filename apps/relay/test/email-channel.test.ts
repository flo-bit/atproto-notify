import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import * as ops from '../src/rpc/ops';

import { installFetchMock, mockComailOk } from './helpers';

beforeEach(() => {
  installFetchMock();
  mockComailOk();
});

it('linkEmail stores an unverified, normalized address', async () => {
  const did: Did = 'did:plc:email-link';
  await ops.linkEmail(env, did, '  Me@Example.com ');
  expect(await ops.getEmailChannel(env, did)).toEqual({ address: 'me@example.com', verified: false });
});

it('rejects an invalid address', async () => {
  const did: Did = 'did:plc:email-bad';
  await expect(ops.linkEmail(env, did, 'not-an-email')).rejects.toThrow();
  expect(await ops.getEmailChannel(env, did)).toBeNull();
});

it('verifyEmail: right code verifies, wrong code does not', async () => {
  const did: Did = 'did:plc:email-verify';
  await ops.linkEmail(env, did, 'a@b.com');
  const code = (await q.getEmailChannel(env.DB, did))?.verify_code;
  if (!code) throw new Error('expected a verify code');

  expect((await ops.verifyEmail(env, did, '000000')).verified).toBe(false);
  expect((await ops.verifyEmail(env, did, code)).verified).toBe(true);
  expect((await ops.getEmailChannel(env, did))?.verified).toBe(true);
  // Delivery query now sees it.
  expect(await q.getVerifiedEmail(env.DB, did)).toBe('a@b.com');
});

it('verifyEmail fails once expired', async () => {
  const did: Did = 'did:plc:email-expired';
  await q.upsertEmailChannel(env.DB, {
    did,
    address: 'c@d.com',
    verifyCode: '123456',
    verifyExpires: Date.now() - 1000, // already expired
    createdAt: Date.now() - 2000,
  });
  expect((await ops.verifyEmail(env, did, '123456')).verified).toBe(false);
});

it('unlinkEmail removes it', async () => {
  const did: Did = 'did:plc:email-unlink';
  await ops.linkEmail(env, did, 'x@y.com');
  await ops.unlinkEmail(env, did);
  expect(await ops.getEmailChannel(env, did)).toBeNull();
});
