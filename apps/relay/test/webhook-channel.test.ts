import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';

import * as q from '../src/db/queries';
import * as ops from '../src/rpc/ops';

/** Webhook targets for `did`, as the unified TargetView (channel === 'webhook'). */
async function webhooks(did: Did) {
  return (await ops.listTargets(env, did)).filter((t) => t.channel === 'webhook');
}

it('addWebhook stores a webhook target with its url + label', async () => {
  const did: Did = 'did:plc:wh-add';
  await ops.addWebhook(env, did, 'https://hook.example/abc', '  My server  ');
  expect(await webhooks(did)).toEqual([
    expect.objectContaining({
      channel: 'webhook',
      url: 'https://hook.example/abc',
      label: 'My server', // trimmed
    }),
  ]);
  // The label is user-supplied at creation, so it's marked `named` (shown to apps).
  const row = await q.getDeliveryTargetByRef(env.DB, 'webhook', `${did} https://hook.example/abc`);
  expect(row?.named).toBe(1);
});

it('rejects a non-https URL', async () => {
  const did: Did = 'did:plc:wh-http';
  await expect(ops.addWebhook(env, did, 'http://hook.example/x', 'L')).rejects.toThrow();
  expect(await webhooks(did)).toHaveLength(0);
});

it('rejects an invalid URL', async () => {
  const did: Did = 'did:plc:wh-bad';
  await expect(ops.addWebhook(env, did, 'not a url', 'L')).rejects.toThrow();
  expect(await webhooks(did)).toHaveLength(0);
});

it('rejects non-public hosts (SSRF defense-in-depth)', async () => {
  const did: Did = 'did:plc:wh-local';
  for (const url of [
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://192.168.0.5/x',
    'https://10.0.0.1/x',
    'https://169.254.1.1/x',
    'https://printer.local/x',
  ]) {
    await expect(ops.addWebhook(env, did, url, 'L')).rejects.toThrow();
  }
  expect(await webhooks(did)).toHaveLength(0);
});

it('requires a non-empty label', async () => {
  const did: Did = 'did:plc:wh-nolabel';
  await expect(ops.addWebhook(env, did, 'https://hook.example/x', '   ')).rejects.toThrow();
  expect(await webhooks(did)).toHaveLength(0);
});

it('a user can add several webhooks and remove one by id', async () => {
  const did: Did = 'did:plc:wh-multi';
  await ops.addWebhook(env, did, 'https://hook.example/one', 'One');
  await ops.addWebhook(env, did, 'https://hook.example/two', 'Two');
  let list = await webhooks(did);
  expect(list).toHaveLength(2);

  const one = list.find((w) => w.channel === 'webhook' && w.url === 'https://hook.example/one');
  await ops.removeTarget(env, did, one!.id);
  list = await webhooks(did);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ url: 'https://hook.example/two' });
});

it('re-adding the same URL is idempotent (deduped per user)', async () => {
  const did: Did = 'did:plc:wh-dup';
  await ops.addWebhook(env, did, 'https://hook.example/dup', 'First');
  await ops.addWebhook(env, did, 'https://hook.example/dup', 'Second');
  expect(await webhooks(did)).toHaveLength(1);
});

it('the same URL can belong to two different users', async () => {
  const a: Did = 'did:plc:wh-shareA';
  const b: Did = 'did:plc:wh-shareB';
  await ops.addWebhook(env, a, 'https://hook.example/shared', 'A');
  await ops.addWebhook(env, b, 'https://hook.example/shared', 'B');
  expect(await webhooks(a)).toHaveLength(1);
  expect(await webhooks(b)).toHaveLength(1);
});
