import denyPending from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/denyPending.json';
import getSettings from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/getSettings.json';
import grant from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/grant.json';
import linkChannel from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/linkChannel.json';
import listChannels from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/listChannels.json';
import listGrants from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/listGrants.json';
import listNotifications from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/listNotifications.json';
import listPending from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/listPending.json';
import muteGrant from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/muteGrant.json';
import registerDevice from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/registerDevice.json';
import requestPermission from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/requestPermission.json';
import revoke from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/revoke.json';
import send from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/send.json';
import unlinkChannel from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/unlinkChannel.json';
import updateSettings from '@atmo/notifs-lexicons/lexicons/tools/atmo/notifs/updateSettings.json';

import type { Env } from './env';

// Lexicon JSONs are bundled into the Worker (imported as JSON modules) and served
// statically from `/lexicons/:nsid`, keyed by NSID.
const LEXICONS: Record<string, unknown> = {
  'tools.atmo.notifs.requestPermission': requestPermission,
  'tools.atmo.notifs.send': send,
  'tools.atmo.notifs.grant': grant,
  'tools.atmo.notifs.revoke': revoke,
  'tools.atmo.notifs.denyPending': denyPending,
  'tools.atmo.notifs.muteGrant': muteGrant,
  'tools.atmo.notifs.listGrants': listGrants,
  'tools.atmo.notifs.listPending': listPending,
  'tools.atmo.notifs.linkChannel': linkChannel,
  'tools.atmo.notifs.unlinkChannel': unlinkChannel,
  'tools.atmo.notifs.listChannels': listChannels,
  'tools.atmo.notifs.listNotifications': listNotifications,
  'tools.atmo.notifs.registerDevice': registerDevice,
  'tools.atmo.notifs.getSettings': getSettings,
  'tools.atmo.notifs.updateSettings': updateSettings,
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
