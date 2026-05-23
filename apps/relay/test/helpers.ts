import { P256PrivateKeyExportable } from '@atcute/crypto';
import type { Did, Nsid } from '@atcute/lexicons';
import { createServiceJwt } from '@atcute/xrpc-server/auth';

export const RELAY_DID = 'did:web:relay.atmo.pub';

// ---------------------------------------------------------------------------
// Outbound fetch mocking
//
// This pool-workers version doesn't expose `fetchMock` on `cloudflare:test`, so
// we stub the global `fetch`. The worker runs in the same isolate as the tests,
// so the stub applies to it too. We install one stable stub function (resolvers
// capture `fetch` at construction time) and mutate a route list per test.
// ---------------------------------------------------------------------------

interface FetchRoute {
  match: (url: URL) => boolean;
  respond: (url: URL) => Response;
}

let routes: FetchRoute[] = [];
let installed = false;

export function installFetchMock(): void {
  routes = [];
  if (installed) {
    return;
  }
  installed = true;
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const href =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    for (const route of routes) {
      if (route.match(url)) {
        return route.respond(url);
      }
    }
    throw new Error(`unmocked fetch: ${url.href}`);
  }) as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function plcPath(did: string): string {
  // PlcDidDocumentResolver requests `/${encodeURIComponent(did)}`.
  return `/${did}`;
}

export interface TestIdentity {
  did: Did;
  keypair: P256PrivateKeyExportable;
  didDoc: unknown;
}

/** Create a fresh did:plc identity with a P-256 signing key and matching DID doc. */
export async function makeIdentity(did: string): Promise<TestIdentity> {
  const keypair = await P256PrivateKeyExportable.createKeypair();
  const multikey = await keypair.exportPublicKey('multikey');
  const didDoc = {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1'],
    id: did,
    verificationMethod: [
      {
        id: `${did}#atproto`,
        type: 'Multikey',
        controller: did,
        publicKeyMultibase: multikey,
      },
    ],
    service: [
      {
        id: '#atproto_pds',
        type: 'AtprotoPersonalDataServer',
        serviceEndpoint: 'https://pds.invalid',
      },
    ],
  };
  return { did: did as Did, keypair, didDoc };
}

/** Resolve this identity's DID document from PLC. */
export function mockPlc(identity: TestIdentity): void {
  routes.push({
    match: (url) =>
      url.hostname === 'plc.directory' && decodeURIComponent(url.pathname) === plcPath(identity.did),
    respond: () => jsonResponse(200, identity.didDoc),
  });
}

/** Make PLC resolution for a DID return 404. */
export function mockPlcNotFound(did: string): void {
  routes.push({
    match: (url) => url.hostname === 'plc.directory' && decodeURIComponent(url.pathname) === plcPath(did),
    respond: () => jsonResponse(404, { message: 'not found' }),
  });
}

/** Accept any Telegram Bot API call with a successful stub response. */
export function mockTelegramOk(): void {
  routes.push({
    match: (url) => url.hostname === 'api.telegram.org',
    respond: () => jsonResponse(200, { ok: true, result: { message_id: 1 } }),
  });
}

/** Stub the AppView profile fetch for any actor. */
export function makeBskyProfileMock(
  profile: { handle?: string; displayName?: string; avatar?: string } = {
    handle: 'sender.example',
    displayName: 'Test Sender',
  },
): void {
  routes.push({
    match: (url) => url.hostname === 'public.api.bsky.app',
    respond: () => jsonResponse(200, profile),
  });
}

export interface JwtOptions {
  lxm: Nsid;
  audience?: string;
  expiresIn?: number;
}

export function makeJwt(identity: TestIdentity, options: JwtOptions): Promise<string> {
  return createServiceJwt({
    keypair: identity.keypair,
    issuer: identity.did,
    audience: (options.audience ?? RELAY_DID) as Did,
    lxm: options.lxm,
    expiresIn: options.expiresIn ?? 60,
  });
}

/** Build an XRPC POST request with a bearer token and JSON body. */
export function xrpcPost(nsid: string, jwt: string, body: unknown): Request {
  return new Request(`https://relay.atmo.pub/xrpc/${nsid}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });
}

/** Build an XRPC GET (query) request with a bearer token. */
export function xrpcGet(nsid: string, jwt: string): Request {
  return new Request(`https://relay.atmo.pub/xrpc/${nsid}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${jwt}` },
  });
}
