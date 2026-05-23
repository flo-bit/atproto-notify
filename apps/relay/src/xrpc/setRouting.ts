import { PubAtmoNotifySetRouting } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import * as q from '../db/queries';
import type { AppContext } from '../env';

const LXM = 'pub.atmo.notify.setRouting';

/**
 * Let an app change how *its own* notifications are routed for a user.
 *
 * A self-scoped management write (see MANAGEMENT-AUTH.md): the app is
 * authenticated by its service-auth bearer and the user by the body `userToken`;
 * `verifyManagementCall` enforces the (user, app) capability + self-write policy.
 * Only ever touches routing rows keyed by (userDid, senderDid) — never the
 * account default, other apps, or channels.
 */
export function makeSetRouting(
  app: AppContext,
): ProcedureConfig<PubAtmoNotifySetRouting.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { appDid: senderDid, userDid } = await verifyManagementCall(app, request, input, {
        scope: 'self',
        write: true,
        lxm: LXM,
      });

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
