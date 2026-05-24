import { PubAtmoNotifyGetRouting } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import type { AppContext } from '../env';
import * as ops from '../rpc/ops';

const LXM = 'pub.atmo.notify.getRouting';

/**
 * Read how the calling app's own notifications are currently routed for a user,
 * so the app can render an accurate in-app settings UI. A self-scoped management
 * read (see MANAGEMENT-AUTH.md). Delegates to `ops.getAppRouting`; returns only
 * this app's slice plus the account-default value and the privacy-safe target
 * catalog (so 'default'/'app' can be labelled and a full picker rendered).
 */
export function makeGetRouting(
  app: AppContext,
): ProcedureConfig<PubAtmoNotifyGetRouting.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { appDid: senderDid, userDid } = await verifyManagementCall(app, request, input, {
        scope: 'self',
        write: false,
        lxm: LXM,
      });

      const view = await ops.getAppRouting(app.env, userDid, senderDid);
      // DB strings → the lexicon's route unions at the boundary (validated on write).
      return json(view as PubAtmoNotifyGetRouting.$output);
    },
  };
}
