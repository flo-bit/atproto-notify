import { isAppRoute, isCategoryRoute, PubAtmoNotifySetRouting } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import type { AppContext } from '../env';
import { invalidRequest } from '../lib/errors';
import * as ops from '../rpc/ops';

const LXM = 'pub.atmo.notify.setRouting';

/**
 * Let an app change how *its own* notifications are routed for a user.
 *
 * A self-scoped management write (see MANAGEMENT-AUTH.md): the app is
 * authenticated by its service-auth bearer and the user by the body `userToken`;
 * `verifyManagementCall` enforces the (user, app) capability + self-write policy.
 * Delegates to the same `ops.*` the binding uses (one implementation), always
 * scoped to (userDid, senderDid) — never the account default, other apps, or channels.
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

      // The lexicon route fields are free strings; validate the token-set format.
      if (input.route !== undefined && !isAppRoute(input.route)) {
        throw invalidRequest('Invalid route');
      }
      for (const c of input.categories ?? []) {
        if (!isCategoryRoute(c.route)) {
          throw invalidRequest('Invalid category route');
        }
      }

      if (input.route !== undefined) {
        await ops.setAppRouting(app.env, userDid, senderDid, input.route);
      }
      for (const c of input.categories ?? []) {
        await ops.setRouting(app.env, userDid, senderDid, c.id, c.route);
      }

      return json({ ok: true });
    },
  };
}
