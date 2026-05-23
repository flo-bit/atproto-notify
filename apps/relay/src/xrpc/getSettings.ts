import { ToolsAtmoNotifsGetSettings } from '@atmo/notifs-lexicons';
import { json, type QueryConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { now } from '../lib/time';

const LXM = 'tools.atmo.notifs.getSettings';

export function makeGetSettings(
  app: AppContext,
): QueryConfig<ToolsAtmoNotifsGetSettings.mainSchema> {
  return {
    handler: async ({ request }) => {
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);

      // Ensure the row exists so we return stored defaults rather than guessing.
      await q.ensureUser(app.env.DB, userDid, now());
      const user = await q.getUser(app.env.DB, userDid);

      return json({
        notifyPendingViaTelegram: (user?.notify_pending_via_telegram ?? 0) === 1,
      });
    },
  };
}
