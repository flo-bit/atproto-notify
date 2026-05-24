import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';

import * as q from '../src/db/queries';
import * as ops from '../src/rpc/ops';

/** DM targets for `did`, as the unified TargetView (channel === 'dm'). */
async function dms(did: Did) {
  return (await ops.listTargets(env, did)).filter((t) => t.channel === 'dm');
}

it('enableDM creates a verified DM target (recipient = the user, no verify step)', async () => {
  const did: Did = 'did:plc:dm-enable';
  await ops.enableDM(env, did);
  expect(await dms(did)).toEqual([expect.objectContaining({ channel: 'dm', label: 'Bluesky DM' })]);

  const row = await q.getDeliveryTargetByRef(env.DB, 'dm', did);
  expect(row?.ref).toBe(did); // DM to self
  expect(row?.verified).toBe(1);
  expect(row?.named).toBe(0); // default label, not user-chosen
});

it('enableDM is idempotent — one DM per user, keeping the same id', async () => {
  const did: Did = 'did:plc:dm-idem';
  await ops.enableDM(env, did);
  const first = (await dms(did))[0];
  await ops.enableDM(env, did);
  const list = await dms(did);
  expect(list).toHaveLength(1);
  expect(list[0]?.id).toBe(first?.id);
});

it('removeTarget disables the DM (scoped to the owner)', async () => {
  const did: Did = 'did:plc:dm-remove';
  await ops.enableDM(env, did);
  const dm = (await dms(did))[0];

  // Another user can't remove it.
  expect((await ops.removeTarget(env, 'did:plc:dm-other' as Did, dm!.id)).ok).toBe(false);
  expect(await dms(did)).toHaveLength(1);

  // The owner can.
  expect((await ops.removeTarget(env, did, dm!.id)).ok).toBe(true);
  expect(await dms(did)).toHaveLength(0);
});

it('renaming a DM stores the name and marks it named (shown to apps)', async () => {
  const did: Did = 'did:plc:dm-rename';
  await ops.enableDM(env, did);
  const dm = (await dms(did))[0];
  await ops.renameTarget(env, did, dm!.id, 'My Bluesky');

  const row = await q.getDeliveryTargetByRef(env.DB, 'dm', did);
  expect(row?.label).toBe('My Bluesky');
  expect(row?.named).toBe(1);
});
