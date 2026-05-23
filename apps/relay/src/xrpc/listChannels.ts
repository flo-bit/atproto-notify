import { ToolsAtmoNotifsListChannels } from '@atmo/notifs-lexicons';
import { json, type QueryConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { toIsoDatetime } from '../lib/time';

const LXM = 'tools.atmo.notifs.listChannels';

export function makeListChannels(
  app: AppContext,
): QueryConfig<ToolsAtmoNotifsListChannels.mainSchema> {
  return {
    handler: async ({ request }) => {
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);
      const rows = await q.listChannelsForDid(app.env.DB, userDid);

      return json({
        channels: rows.map((row) => ({
          deviceId: row.device_id,
          platform: row.platform,
          linkedAt: toIsoDatetime(row.linked_at),
          displayName: row.display_name ?? undefined,
        })),
      });
    },
  };
}
