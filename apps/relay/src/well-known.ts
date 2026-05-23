import getRouting from '@atmo/notifs-lexicons/lexicons/pub/atmo/notify/getRouting.json';
import listNotifications from '@atmo/notifs-lexicons/lexicons/pub/atmo/notify/listNotifications.json';
import markRead from '@atmo/notifs-lexicons/lexicons/pub/atmo/notify/markRead.json';
import requestPermission from '@atmo/notifs-lexicons/lexicons/pub/atmo/notify/requestPermission.json';
import send from '@atmo/notifs-lexicons/lexicons/pub/atmo/notify/send.json';
import setRouting from '@atmo/notifs-lexicons/lexicons/pub/atmo/notify/setRouting.json';
import subscriberChanged from '@atmo/notifs-lexicons/lexicons/pub/atmo/notify/subscriberChanged.json';

import type { Env } from './env';

// Only the *federated* lexicons are published here. The first-party
// user-management methods are not public XRPC — they live behind the `RelayRpc`
// service binding — so their lexicon JSON is intentionally NOT served (those
// files remain in the package purely as type-generation input). See
// src/rpc/entrypoint.ts.
const LEXICONS: Record<string, unknown> = {
  'pub.atmo.notify.requestPermission': requestPermission,
  'pub.atmo.notify.send': send,
  'pub.atmo.notify.setRouting': setRouting,
  'pub.atmo.notify.getRouting': getRouting,
  'pub.atmo.notify.listNotifications': listNotifications,
  'pub.atmo.notify.markRead': markRead,
  'pub.atmo.notify.subscriberChanged': subscriberChanged,
};

// Relay's public signing key (multikey), published so apps can verify outbound
// service-auth JWTs the relay issues (e.g. the `subscriberChanged` callback,
// ENABLE-FROM-WEB.md). Its private half is the RELAY_PRIVATE_KEY secret. Rotate
// both together via `relay:keygen`.
const RELAY_PUBLIC_KEY_MULTIBASE = 'zDnaeZB4zYA9upEh4bXkxXjsQJJhdq9zuNVtmk9QXhrno5yhd';

/**
 * `GET /.well-known/did.json` — the relay's `did:web` document. Publishes an
 * `#atproto` verification method so apps can verify the JWTs the relay signs for
 * its outbound callbacks. The service endpoint is derived from `RELAY_DID` so
 * config has one source.
 */
export function handleWellKnownDid(env: Env): Response {
  const host = env.RELAY_DID.replace(/^did:web:/, '');
  const doc = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/multikey/v1',
    ],
    id: env.RELAY_DID,
    verificationMethod: [
      {
        id: `${env.RELAY_DID}#atproto`,
        type: 'Multikey',
        controller: env.RELAY_DID,
        publicKeyMultibase: RELAY_PUBLIC_KEY_MULTIBASE,
      },
    ],
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
