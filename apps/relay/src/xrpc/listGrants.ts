import { ToolsAtmoNotifsListGrants } from '@atmo/notifs-lexicons';
import { json, type QueryConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { toIsoDatetime } from '../lib/time';

const LXM = 'tools.atmo.notifs.listGrants';

export function makeListGrants(app: AppContext): QueryConfig<ToolsAtmoNotifsListGrants.mainSchema> {
  return {
    handler: async ({ request }) => {
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);
      const rows = await q.listGrantsForRecipient(app.env.DB, userDid);

      return json({
        grants: rows.map((row) => ({
          sender: row.sender_did,
          senderHandle: row.handle ?? undefined,
          senderDisplayName: row.display_name ?? undefined,
          senderAvatar: row.avatar_url ?? undefined,
          grantedAt: toIsoDatetime(row.granted_at),
          muted: row.muted === 1,
        })),
      });
    },
  };
}
