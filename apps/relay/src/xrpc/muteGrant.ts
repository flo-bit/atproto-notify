import { ToolsAtmoNotifsMuteGrant } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';

const LXM = 'tools.atmo.notifs.muteGrant';

export function makeMuteGrant(
  app: AppContext,
): ProcedureConfig<ToolsAtmoNotifsMuteGrant.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);

      await q.setGrantMuted(app.env.DB, userDid, input.sender, input.muted);

      return json({ muted: input.muted });
    },
  };
}
