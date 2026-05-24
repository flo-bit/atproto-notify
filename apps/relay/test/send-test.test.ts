import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';

import * as ops from '../src/rpc/ops';

import { addDMTarget, addPush, addVerifiedEmail } from './helpers';

it('sendTest fans out to the requested channel only', async () => {
  const did: Did = 'did:plc:sendtest';
  await addPush(env.DB, did, 'https://push.example/st');
  await addDMTarget(env.DB, did);

  expect((await ops.sendTest(env, did, 'push')).delivered).toBe(1);
  expect((await ops.sendTest(env, did, 'dm')).delivered).toBe(1);
  // No email linked → nothing to test.
  expect((await ops.sendTest(env, did, 'email')).delivered).toBe(0);
});

it('sendTest only counts verified targets', async () => {
  const did: Did = 'did:plc:sendtest-verified';
  await addVerifiedEmail(env.DB, did, 'me@example.com');
  expect((await ops.sendTest(env, did, 'email')).delivered).toBe(1);
});
