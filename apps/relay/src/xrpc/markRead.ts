import { PubAtmoNotifyMarkRead } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { now } from '../lib/time';

const LXM = 'pub.atmo.notify.markRead';

/**
 * Let an app mark the notifications *it* sent to a user as read — all of them,
 * or a specific `ids` set. A self-scoped management write (see MANAGEMENT-AUTH.md);
 * the update is scoped to (userDid, senderDid), so ids belonging to other apps
 * are silently ignored.
 */
export function makeMarkRead(app: AppContext): ProcedureConfig<PubAtmoNotifyMarkRead.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { appDid: senderDid, userDid } = await verifyManagementCall(app, request, input, {
        scope: 'self',
        write: true,
        lxm: LXM,
      });

      const marked = await q.markNotificationsReadFromSender(
        app.env.DB,
        userDid,
        senderDid,
        now(),
        input.ids,
      );

      return json({ marked });
    },
  };
}
