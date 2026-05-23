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
          // user-supplied display metadata (fall back to the DID for title)
          title: row.title ?? row.sender_did,
          description: row.description ?? undefined,
          iconUrl: row.icon_url ?? undefined,
          // best-effort Bluesky profile (informational "verified on Bluesky")
          senderHandle: row.handle ?? undefined,
          senderBskyDisplayName: row.display_name ?? undefined,
          senderBskyAvatar: row.avatar_url ?? undefined,
          createdAt: toIsoDatetime(row.created_at),
          expiresAt: toIsoDatetime(row.expires_at),
        })),
      });
    },
  };
}
