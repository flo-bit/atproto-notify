import { ToolsAtmoNotifsUnlinkChannel } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';

const LXM = 'tools.atmo.notifs.unlinkChannel';

export function makeUnlinkChannel(
  app: AppContext,
): ProcedureConfig<ToolsAtmoNotifsUnlinkChannel.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);

      const unlinked = await q.deleteChannel(app.env.DB, userDid, input.platform);

      return json({ unlinked });
    },
  };
}
