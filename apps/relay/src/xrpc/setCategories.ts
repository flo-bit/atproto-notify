import { isCategoryRoute, PubAtmoNotifySetCategories } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import type { AppContext } from '../env';
import { invalidRequest } from '../lib/errors';
import * as ops from '../rpc/ops';

const LXM = 'pub.atmo.notify.setCategories';

/**
 * Replace the calling app's category catalog for a user (full sync). Self-scoped
 * management write (app JWT + a fresh user token). Only ever touches categories +
 * routing keyed by (userDid, appDid).
 */
export function makeSetCategories(
  app: AppContext,
): ProcedureConfig<PubAtmoNotifySetCategories.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { appDid, userDid } = await verifyManagementCall(app, request, input, {
        scope: 'self',
        write: true,
        lxm: LXM,
      });

      for (const c of input.categories) {
        if (c.route !== undefined && !isCategoryRoute(c.route)) {
          throw invalidRequest('Invalid category route');
        }
      }

      await ops.setCategories(
        app.env,
        userDid,
        appDid,
        input.categories.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          route: c.route,
        })),
      );
      return json({ ok: true });
    },
  };
}
