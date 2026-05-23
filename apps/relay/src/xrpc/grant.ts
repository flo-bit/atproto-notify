import { ToolsAtmoNotifsGrant } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { now } from '../lib/time';

const LXM = 'tools.atmo.notifs.grant';

export function makeGrant(app: AppContext): ProcedureConfig<ToolsAtmoNotifsGrant.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);

      await q.ensureUser(app.env.DB, userDid, now());
      await q.upsertGrant(app.env.DB, userDid, input.sender, now());
      if (input.requestId !== undefined) {
        await q.deletePendingById(app.env.DB, input.requestId, userDid);
      }

      return json({ granted: true });
    },
  };
}
