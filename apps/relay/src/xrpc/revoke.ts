import { ToolsAtmoNotifsRevoke } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';

const LXM = 'tools.atmo.notifs.revoke';

export function makeRevoke(app: AppContext): ProcedureConfig<ToolsAtmoNotifsRevoke.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);

      const revoked = await q.deleteGrant(app.env.DB, userDid, input.sender);
      // The pending request (if any) for this pair is now irrelevant.
      await q.deletePendingByPair(app.env.DB, userDid, input.sender);

      return json({ revoked });
    },
  };
}
