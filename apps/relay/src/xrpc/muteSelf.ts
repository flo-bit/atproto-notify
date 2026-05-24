import { PubAtmoNotifyMuteSelf } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import type { AppContext } from '../env';
import * as ops from '../rpc/ops';

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
      await ops.muteGrant(app.env, userDid, { sender: appDid, muted: input.muted });
      return json({ ok: true });
    },
  };
}
