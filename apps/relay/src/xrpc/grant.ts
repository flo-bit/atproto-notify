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

      // When granting from a pending request, copy its display metadata onto the
      // grant so listGrants can show it later. For a manual grant (no requestId)
      // the metadata stays null and listGrants falls back to Bluesky-resolved info.
      const pending =
        input.requestId !== undefined
          ? await q.getPendingById(app.env.DB, input.requestId)
          : null;
      const fromPending = pending !== null && pending.recipient_did === userDid ? pending : null;

      await q.upsertGrant(app.env.DB, {
        recipientDid: userDid,
        senderDid: input.sender,
        grantedAt: now(),
        title: fromPending?.title ?? null,
        description: fromPending?.description ?? null,
        iconUrl: fromPending?.icon_url ?? null,
      });

      if (input.requestId !== undefined) {
        await q.deletePendingById(app.env.DB, input.requestId, userDid);
      }

      return json({ granted: true });
    },
  };
}
