import { PubAtmoNotifyRemoveCategory } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import type { AppContext } from '../env';
import * as ops from '../rpc/ops';

const LXM = 'pub.atmo.notify.removeCategory';

/** Remove one of the calling app's categories for a user (+ its routing). Self-scoped. */
export function makeRemoveCategory(
  app: AppContext,
): ProcedureConfig<PubAtmoNotifyRemoveCategory.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { appDid, userDid } = await verifyManagementCall(app, request, input, {
        scope: 'self',
        write: true,
        lxm: LXM,
      });

      const { removed } = await ops.removeCategory(app.env, userDid, appDid, input.id);
      return json({ removed });
    },
  };
}
