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

/** Email targets for `did`, as the unified TargetView (channel === 'email'). */
async function emails(did: Did) {
  return (await ops.listTargets(env, did)).filter((t) => t.channel === 'email');
}

it('linkEmail stores an unverified, normalized address', async () => {
  const did: Did = 'did:plc:email-link';
  await ops.linkEmail(env, did, '  Me@Example.com ');
  expect(await emails(did)).toEqual([
    expect.objectContaining({ channel: 'email', address: 'me@example.com', verified: false }),
  ]);
});

it('without a label the address is the label and the target is not `named`', async () => {
  const did: Did = 'did:plc:email-noname';
  await ops.linkEmail(env, did, 'plain@x.com');
  const row = await q.getDeliveryTargetByRef(env.DB, 'email', 'plain@x.com');
  expect(row?.label).toBe('plain@x.com');
  expect(row?.named).toBe(0);
});

it('a user-supplied label is stored and marked `named` (shown to apps)', async () => {
  const did: Did = 'did:plc:email-named';
  await ops.linkEmail(env, did, 'work@x.com', '  Work inbox  ');
  const row = await q.getDeliveryTargetByRef(env.DB, 'email', 'work@x.com');
  expect(row?.label).toBe('Work inbox'); // trimmed
  expect(row?.named).toBe(1);
  expect((await emails(did))[0]).toMatchObject({ address: 'work@x.com', label: 'Work inbox' });
});

it('rejects an invalid address', async () => {
  const did: Did = 'did:plc:email-bad';
  await expect(ops.linkEmail(env, did, 'not-an-email')).rejects.toThrow();
  expect(await emails(did)).toHaveLength(0);
});

it('verifyEmail: right code verifies, wrong code does not', async () => {
  const did: Did = 'did:plc:email-verify';
  await ops.linkEmail(env, did, 'a@b.com');
  const target = await q.getDeliveryTargetByRef(env.DB, 'email', 'a@b.com');
  const code = (JSON.parse(target?.config ?? '{}') as { code?: string }).code;
  if (!code) throw new Error('expected a verify code');

  expect((await ops.verifyEmail(env, did, '000000')).verified).toBe(false);
  expect((await ops.verifyEmail(env, did, code)).verified).toBe(true);
  expect((await emails(did))[0]?.verified).toBe(true);
});

it('verifyEmail fails once expired', async () => {
  const did: Did = 'did:plc:email-expired';
  await q.upsertDeliveryTarget(env.DB, {
    id: 'expired-email-target',
    did,
    channel: 'email',
    ref: 'c@d.com',
    label: 'c@d.com',
    verified: false,
    config: { code: '123456', expires: Date.now() - 1000 }, // already expired
    createdAt: Date.now() - 2000,
  });
  expect((await ops.verifyEmail(env, did, '123456')).verified).toBe(false);
});

it('a user can link several emails and remove one by id', async () => {
  const did: Did = 'did:plc:email-multi';
  await ops.linkEmail(env, did, 'one@x.com');
  await ops.linkEmail(env, did, 'two@x.com');
  let list = await emails(did);
  expect(list).toHaveLength(2);

  const one = list.find((e) => e.channel === 'email' && e.address === 'one@x.com');
  await ops.removeTarget(env, did, one!.id);
  list = await emails(did);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ address: 'two@x.com' });
});

it('linkEmail rejects an address already linked to another account', async () => {
  const owner: Did = 'did:plc:email-owner';
  const other: Did = 'did:plc:email-thief';
  await ops.linkEmail(env, owner, 'shared@x.com');
  await expect(ops.linkEmail(env, other, 'shared@x.com')).rejects.toThrow();
});
