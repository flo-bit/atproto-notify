import { PubAtmoNotifyRevokeSelf } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import type { AppContext } from '../env';
import * as ops from '../rpc/ops';

const LXM = 'pub.atmo.notify.revokeSelf';

/** An app removes its own grant for a user (turns itself off). Self-scoped.
 *  Delegates to `ops.revoke` so it also cascades routing/categories + fires the
 *  subscriberChanged callback. */
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
      await ops.revoke(app.env, userDid, { sender: appDid });
      return json({ ok: true });
    },
  };
}
