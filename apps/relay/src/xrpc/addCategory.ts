import { isCategoryRoute, PubAtmoNotifyAddCategory } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import type { AppContext } from '../env';
import { invalidRequest } from '../lib/errors';
import * as ops from '../rpc/ops';

const LXM = 'pub.atmo.notify.addCategory';

/** Declare (add/update) one of the calling app's categories for a user. Self-scoped. */
export function makeAddCategory(
  app: AppContext,
): ProcedureConfig<PubAtmoNotifyAddCategory.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { appDid, userDid } = await verifyManagementCall(app, request, input, {
        scope: 'self',
        write: true,
        lxm: LXM,
      });

      if (input.route !== undefined && !isCategoryRoute(input.route)) {
        throw invalidRequest('Invalid category route');
      }

      await ops.addCategory(app.env, userDid, appDid, {
        id: input.id,
        title: input.title,
        description: input.description,
        route: input.route,
      });
      return json({ ok: true });
    },
  };
}
