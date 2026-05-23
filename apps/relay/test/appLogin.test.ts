import { env } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import { verifyAppLogin } from '../src/rpc/ops';

import { installFetchMock, makeIdentity, makeJwt, mockPlc, RELAY_DID } from './helpers';

beforeAll(() => {
  installFetchMock();
});

const LXM = 'pub.atmo.auth';

it('verifies a valid token and returns the issuer DID', async () => {
  const user = await makeIdentity('did:plc:applogin1');
  mockPlc(user);
  const token = await makeJwt(user, { lxm: LXM });

  const { did } = await verifyAppLogin(env, token);

  expect(did).toBe(user.did);
});

it('rejects a token bound to a different lxm', async () => {
  const user = await makeIdentity('did:plc:applogin2');
  mockPlc(user);
  const token = await makeJwt(user, { lxm: 'pub.atmo.notify.send' });

  await expect(verifyAppLogin(env, token)).rejects.toThrow();
});

it('rejects a token addressed to a different audience', async () => {
  const user = await makeIdentity('did:plc:applogin3');
  mockPlc(user);
  const token = await makeJwt(user, { lxm: LXM, audience: 'did:web:someone.else' });

  await expect(verifyAppLogin(env, token)).rejects.toThrow();
});

it('rejects an expired token', async () => {
  const user = await makeIdentity('did:plc:applogin4');
  mockPlc(user);
  const token = await makeJwt(user, { lxm: LXM, expiresIn: -60 });

  await expect(verifyAppLogin(env, token)).rejects.toThrow();
});

it('rejects a token that has already been used (single-use)', async () => {
  const user = await makeIdentity('did:plc:applogin5');
  mockPlc(user);
  const token = await makeJwt(user, { lxm: LXM });

  await expect(verifyAppLogin(env, token)).resolves.toEqual({ did: user.did });
  await expect(verifyAppLogin(env, token)).rejects.toThrow();
});

it('ensures the relay DID is the accepted audience', () => {
  // Guards against an accidental rename of the test/helper relay DID.
  expect(RELAY_DID).toBe('did:web:relay.atmo.pub');
});
