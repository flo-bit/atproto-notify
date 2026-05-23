import { ToolsAtmoNotifsDenyPending } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';

const LXM = 'tools.atmo.notifs.denyPending';

export function makeDenyPending(
  app: AppContext,
): ProcedureConfig<ToolsAtmoNotifsDenyPending.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);

      // Delete the pending request without granting. Does not blocklist the
      // sender; they may request again once rate limits allow.
      const denied = await q.deletePendingById(app.env.DB, input.requestId, userDid);

      return json({ denied });
    },
  };
}
