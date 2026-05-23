import { PubAtmoNotifyRevokeSelf } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import * as q from '../db/queries';
import type { AppContext } from '../env';

const LXM = 'pub.atmo.notify.revokeSelf';

/** An app removes its own grant for a user (turns itself off). Self-scoped. */
export function makeRevokeSelf(
  app: AppContext,
): ProcedureConfig<PubAtmoNotifyRevokeSelf.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { appDid, userDid } = await verifyManagementCall(app, request, input, {
        scope: 'self',
        write: true,
        lxm: LXM,
      });
      await q.deleteGrant(app.env.DB, userDid, appDid);
      return json({ ok: true });
    },
  };
}
