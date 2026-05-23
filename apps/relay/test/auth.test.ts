import type { Did } from '@atcute/lexicons';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

import worker from '../src/index';

import {
  installFetchMock,
  makeBskyProfileMock,
  makeIdentity,
  makeJwt,
  mockPlc,
  mockPlcNotFound,
  xrpcPost,
} from './helpers';

beforeAll(() => {
  installFetchMock();
  // requestPermission fires a best-effort sender-profile refresh; stub it.
  makeBskyProfileMock();
});

// requestPermission is the remaining user-OAuth XRPC endpoint, so it's what
// exercises the user-JWT verifier now that the management methods moved to the
// service binding. A valid body is sent in every case so the request reaches the
// auth check rather than tripping schema validation first.
const REQ = 'pub.atmo.notify.requestPermission';
const SENDER: Did = 'did:plc:authsender';
const BODY = { senderDid: SENDER, title: 'Test' };

async function call(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

it('accepts a valid user JWT (happy path)', async () => {
  const user = await makeIdentity('did:plc:authhappy');
  mockPlc(user);
  const jwt = await makeJwt(user, { lxm: REQ });

  const res = await call(xrpcPost(REQ, jwt, BODY));

  expect(res.status).toBe(200);
});

it('rejects an expired JWT', async () => {
  const user = await makeIdentity('did:plc:authexpired');
  mockPlc(user);
  const jwt = await makeJwt(user, { lxm: REQ, expiresIn: -120 });

  const res = await call(xrpcPost(REQ, jwt, BODY));

  expect(res.status).toBe(401);
});

it('rejects a JWT addressed to the wrong audience', async () => {
  const user = await makeIdentity('did:plc:authaud');
  mockPlc(user);
  const jwt = await makeJwt(user, { lxm: REQ, audience: 'did:web:evil.example' });

  const res = await call(xrpcPost(REQ, jwt, BODY));

  expect(res.status).toBe(401);
});

it('rejects a JWT scoped to a different lexicon method', async () => {
  const user = await makeIdentity('did:plc:authlxm');
  mockPlc(user);
  // Token authorizes `send`, but we call `requestPermission`.
  const jwt = await makeJwt(user, { lxm: 'pub.atmo.notify.send' });

  const res = await call(xrpcPost(REQ, jwt, BODY));

  expect(res.status).toBe(401);
});

it('rejects a JWT from an unresolvable DID', async () => {
  const user = await makeIdentity('did:plc:authunknown');
  mockPlcNotFound(user.did);
  const jwt = await makeJwt(user, { lxm: REQ });

  const res = await call(xrpcPost(REQ, jwt, BODY));

  expect(res.status).toBe(401);
});
