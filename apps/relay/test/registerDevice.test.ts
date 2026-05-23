import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import * as q from '../src/db/queries';
import worker from '../src/index';

import { installFetchMock, makeIdentity, makeJwt, mockPlc, xrpcPost } from './helpers';

beforeAll(() => {
  installFetchMock();
});

const LXM = 'tools.atmo.notifs.registerDevice';

async function call(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

it('registers a new device and returns a deviceId', async () => {
  const user = await makeIdentity('did:plc:devuser1');
  mockPlc(user);
  const jwt = await makeJwt(user, { lxm: LXM });

  const res = await call(
    xrpcPost(LXM, jwt, { platform: 'ios', token: 'apns-tok-1', deviceName: 'iPhone 15' }),
  );

  expect(res.status).toBe(200);
  const body = (await res.json()) as { deviceId: string };
  expect(typeof body.deviceId).toBe('string');
  expect(body.deviceId.length).toBeGreaterThan(0);

  const row = await q.getChannelByPlatformUser(env.DB, 'ios', 'apns-tok-1');
  expect(row?.did).toBe(user.did);
  expect(row?.platform).toBe('ios');
  expect(row?.display_name).toBe('iPhone 15');
  expect(row?.device_id).toBe(body.deviceId);
});

it('re-registering the same token returns the same deviceId and refreshes the name', async () => {
  const user = await makeIdentity('did:plc:devuser2');
  mockPlc(user);

  const first = (await (
    await call(xrpcPost(LXM, await makeJwt(user, { lxm: LXM }), { platform: 'android', token: 'fcm-tok-2' }))
  ).json()) as { deviceId: string };

  const second = (await (
    await call(
      xrpcPost(LXM, await makeJwt(user, { lxm: LXM }), {
        platform: 'android',
        token: 'fcm-tok-2',
        deviceName: 'Pixel 8',
      }),
    )
  ).json()) as { deviceId: string };

  expect(second.deviceId).toBe(first.deviceId);
  const row = await q.getChannelByPlatformUser(env.DB, 'android', 'fcm-tok-2');
  expect(row?.display_name).toBe('Pixel 8'); // refreshed
  const all = await q.listChannelsForDid(env.DB, user.did);
  expect(all.filter((c) => c.platform_user_id === 'fcm-tok-2')).toHaveLength(1);
});

it('the same token from a different DID reassigns the row to the new user', async () => {
  const userA = await makeIdentity('did:plc:devA');
  const userB = await makeIdentity('did:plc:devB');
  mockPlc(userA);
  mockPlc(userB);

  const a = (await (
    await call(xrpcPost(LXM, await makeJwt(userA, { lxm: LXM }), { platform: 'ios', token: 'shared-tok' }))
  ).json()) as { deviceId: string };

  const b = (await (
    await call(xrpcPost(LXM, await makeJwt(userB, { lxm: LXM }), { platform: 'ios', token: 'shared-tok' }))
  ).json()) as { deviceId: string };

  const row = await q.getChannelByPlatformUser(env.DB, 'ios', 'shared-tok');
  expect(row?.did).toBe(userB.did);
  expect(b.deviceId).not.toBe(a.deviceId);

  // userA's stale row for that token is gone.
  const aChannels = await q.listChannelsForDid(env.DB, userA.did);
  expect(aChannels.find((c) => c.platform_user_id === 'shared-tok')).toBeUndefined();
});

it('rejects an unknown platform', async () => {
  const user = await makeIdentity('did:plc:devbad');
  mockPlc(user);
  const jwt = await makeJwt(user, { lxm: LXM });
  const res = await call(xrpcPost(LXM, jwt, { platform: 'web', token: 'x' }));
  expect(res.status).toBe(400); // lexicon enum rejects "web"
});
