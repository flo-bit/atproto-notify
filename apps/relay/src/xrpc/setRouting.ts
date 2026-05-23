import { PubAtmoNotifySetRouting } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifySenderRequest, verifyServiceToken } from '../auth/sender';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { notAuthorized } from '../lib/errors';

const LXM = 'pub.atmo.notify.setRouting';

/**
 * Let an app change how *its own* notifications are routed for a user.
 *
 * Dual-authenticated: the app proves its identity with its service-auth JWT in
 * the Authorization header (→ `senderDid`), and the user proves consent with a
 * fresh user-issued service-auth JWT in `userToken` (→ `userDid`). Both are
 * scoped to this method. We then require an active grant from the user to the
 * app, and only ever touch routing rows keyed by (userDid, senderDid) — so an
 * app can never reach the account default, other apps, or channels.
 */
export function makeSetRouting(
  app: AppContext,
): ProcedureConfig<PubAtmoNotifySetRouting.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { senderDid } = await verifySenderRequest(app.verifier, request, LXM);
      const { did: userDid } = await verifyServiceToken(app.verifier, input.userToken, LXM);

      // The two tokens must be distinct identities, and the user must have an
      // active grant for this app (i.e. the app is approved to notify them).
      if (userDid === senderDid) throw notAuthorized();
      if ((await q.getGrant(app.env.DB, userDid, senderDid)) === null) throw notAuthorized();

      if (input.route !== undefined) {
        if (input.route === 'default') {
          await q.deleteAppRoute(app.env.DB, userDid, senderDid);
        } else {
          await q.upsertAppRoute(app.env.DB, userDid, senderDid, input.route);
        }
      }

      for (const c of input.categories ?? []) {
        if (c.route === 'app') {
          await q.deleteRouting(app.env.DB, userDid, senderDid, c.id);
        } else {
          await q.upsertRouting(app.env.DB, userDid, senderDid, c.id, c.route);
        }
      }

      return json({ ok: true });
    },
  };
}
