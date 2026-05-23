import type { Did } from '@atcute/lexicons';
import type { AtprotoAudience } from '@atcute/lexicons/syntax';
import { ServiceJwtVerifier } from '@atcute/xrpc-server/auth';

import type { Env } from '../env';
import { makeResolver } from '../identity/resolve';

// One verifier per Env (constructing the resolver is cheap but pointless to
// repeat each request; the underlying DID-doc cache lives in KV anyway).
const verifiers = new WeakMap<Env, ServiceJwtVerifier>();

export function getVerifier(env: Env): ServiceJwtVerifier {
  let verifier = verifiers.get(env);
  if (verifier === undefined) {
    verifier = makeVerifier(env);
    verifiers.set(env, verifier);
  }
  return verifier;
}

export function makeVerifier(env: Env): ServiceJwtVerifier {
  const relayDid = env.RELAY_DID as Did;
  return new ServiceJwtVerifier({
    // Accept tokens addressed to the bare relay DID or the service-ref form.
    acceptAudiences: [relayDid, `${relayDid}#notif_relay` as AtprotoAudience],
    resolver: makeResolver(env.CACHE),
    maxAge: 300,
    clockLeeway: 5,
  });
}
