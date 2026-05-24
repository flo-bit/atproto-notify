import { PubAtmoNotifyGetCategories } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import type { AppContext } from '../env';
import * as ops from '../rpc/ops';

const LXM = 'pub.atmo.notify.getCategories';

/** List the calling app's categories for a user (its own only), with each route. Self-scoped read. */
export function makeGetCategories(
  app: AppContext,
): ProcedureConfig<PubAtmoNotifyGetCategories.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { appDid, userDid } = await verifyManagementCall(app, request, input, {
        scope: 'self',
        write: false,
        lxm: LXM,
      });

      const { categories } = await ops.getCategories(app.env, userDid, appDid);
      return json({ categories });
    },
  };
}
