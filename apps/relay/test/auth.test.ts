import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import worker from '../src/index';

import { installFetchMock, makeIdentity, makeJwt, mockPlc, mockPlcNotFound, xrpcGet } from './helpers';

beforeAll(() => {
  installFetchMock();
});

const GET_SETTINGS = 'tools.atmo.notifs.getSettings';

async function call(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

it('accepts a valid user JWT (happy path)', async () => {
  const user = await makeIdentity('did:plc:authhappy');
  mockPlc(user);
  const jwt = await makeJwt(user, { lxm: GET_SETTINGS });

  const res = await call(xrpcGet(GET_SETTINGS, jwt));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ notifyPendingViaTelegram: false });
});

it('rejects an expired JWT', async () => {
  const user = await makeIdentity('did:plc:authexpired');
  mockPlc(user);
  const jwt = await makeJwt(user, { lxm: GET_SETTINGS, expiresIn: -120 });

  const res = await call(xrpcGet(GET_SETTINGS, jwt));

  expect(res.status).toBe(401);
});

it('rejects a JWT addressed to the wrong audience', async () => {
  const user = await makeIdentity('did:plc:authaud');
  mockPlc(user);
  const jwt = await makeJwt(user, { lxm: GET_SETTINGS, audience: 'did:web:evil.example' });

  const res = await call(xrpcGet(GET_SETTINGS, jwt));

  expect(res.status).toBe(401);
});

it('rejects a JWT scoped to a different lexicon method', async () => {
  const user = await makeIdentity('did:plc:authlxm');
  mockPlc(user);
  // Token authorizes `send`, but we call `getSettings`.
  const jwt = await makeJwt(user, { lxm: 'tools.atmo.notifs.send' });

  const res = await call(xrpcGet(GET_SETTINGS, jwt));

  expect(res.status).toBe(401);
});

it('rejects a JWT from an unresolvable DID', async () => {
  const user = await makeIdentity('did:plc:authunknown');
  mockPlcNotFound(user.did);
  const jwt = await makeJwt(user, { lxm: GET_SETTINGS });

  const res = await call(xrpcGet(GET_SETTINGS, jwt));

  expect(res.status).toBe(401);
});
