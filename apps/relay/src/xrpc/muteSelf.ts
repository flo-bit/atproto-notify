import { PubAtmoNotifyMuteSelf } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import * as q from '../db/queries';
import type { AppContext } from '../env';

const LXM = 'pub.atmo.notify.muteSelf';

/** An app mutes/unmutes its own notifications for a user. Self-scoped. */
export function makeMuteSelf(app: AppContext): ProcedureConfig<PubAtmoNotifyMuteSelf.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { appDid, userDid } = await verifyManagementCall(app, request, input, {
        scope: 'self',
        write: true,
        lxm: LXM,
      });
      await q.setGrantMuted(app.env.DB, userDid, appDid, input.muted);
      return json({ ok: true });
    },
  };
}
