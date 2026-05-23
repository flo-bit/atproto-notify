import { ToolsAtmoNotifsUpdateSettings } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { now } from '../lib/time';

const LXM = 'tools.atmo.notifs.updateSettings';

export function makeUpdateSettings(
  app: AppContext,
): ProcedureConfig<ToolsAtmoNotifsUpdateSettings.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);
      await q.ensureUser(app.env.DB, userDid, now());

      // Partial PATCH: only touch fields present in the input.
      if (input.notifyPendingViaTelegram !== undefined) {
        await q.setNotifyPending(app.env.DB, userDid, input.notifyPendingViaTelegram);
      }

      const user = await q.getUser(app.env.DB, userDid);
      return json({
        notifyPendingViaTelegram: (user?.notify_pending_via_telegram ?? 0) === 1,
      });
    },
  };
}
