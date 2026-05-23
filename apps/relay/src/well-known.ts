import requestPermission from '@atmo/notifs-lexicons/lexicons/pub/atmo/notify/requestPermission.json';
import send from '@atmo/notifs-lexicons/lexicons/pub/atmo/notify/send.json';

import type { Env } from './env';

// Only the *federated* lexicons are published here. The user-management methods
// are no longer public XRPC — they live behind the `RelayRpc` service binding —
// so their lexicon JSON is intentionally NOT served (the files remain in the
// package purely as type-generation input). See src/rpc/entrypoint.ts.
const LEXICONS: Record<string, unknown> = {
  'pub.atmo.notify.requestPermission': requestPermission,
  'pub.atmo.notify.send': send,
};

/**
 * `GET /.well-known/did.json` — the relay's `did:web` document. No
 * `verificationMethod`: the relay verifies inbound JWTs but never signs anything.
 * The service endpoint is derived from `RELAY_DID` so config has one source.
 */
export function handleWellKnownDid(env: Env): Response {
  const host = env.RELAY_DID.replace(/^did:web:/, '');
  const doc = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: env.RELAY_DID,
    service: [
      {
        id: '#notif_relay',
        type: 'AtprotoNotificationRelay',
        serviceEndpoint: `https://${host}`,
      },
    ],
  };
  return Response.json(doc);
}

/** `GET /lexicons/:nsid` — serve a bundled lexicon document, CDN-cacheable. */
export function handleLexicon(nsid: string): Response {
  const doc = LEXICONS[nsid];
  if (doc === undefined) {
    return new Response('Not found', { status: 404 });
  }
  return Response.json(doc, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
