import { ToolsAtmoNotifsListPending } from '@atmo/notifs-lexicons';
import { json, type QueryConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { now, toIsoDatetime } from '../lib/time';

const LXM = 'tools.atmo.notifs.listPending';

export function makeListPending(
  app: AppContext,
): QueryConfig<ToolsAtmoNotifsListPending.mainSchema> {
  return {
    handler: async ({ request }) => {
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);
      const rows = await q.listPendingForRecipient(app.env.DB, userDid, now());

      return json({
        pending: rows.map((row) => ({
          id: row.id,
          sender: row.sender_did,
          senderHandle: row.handle ?? undefined,
          senderDisplayName: row.display_name ?? undefined,
          senderAvatar: row.avatar_url ?? undefined,
          reason: row.reason ?? undefined,
          createdAt: toIsoDatetime(row.created_at),
          expiresAt: toIsoDatetime(row.expires_at),
        })),
      });
    },
  };
}
