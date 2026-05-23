import { PubAtmoNotifyMarkRead } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifySenderRequest, verifyServiceToken } from '../auth/sender';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { notAuthorized } from '../lib/errors';
import { now } from '../lib/time';

const LXM = 'pub.atmo.notify.markRead';

/**
 * Let an app mark the notifications *it* sent to a user as read — all of them,
 * or a specific `ids` set. Dual-authenticated and grant-gated like setRouting;
 * the update is scoped to (userDid, senderDid), so ids belonging to other apps
 * are silently ignored.
 */
export function makeMarkRead(app: AppContext): ProcedureConfig<PubAtmoNotifyMarkRead.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { senderDid } = await verifySenderRequest(app.verifier, request, LXM);
      const { did: userDid } = await verifyServiceToken(app.verifier, input.userToken, LXM);

      if (userDid === senderDid) throw notAuthorized();
      if ((await q.getGrant(app.env.DB, userDid, senderDid)) === null) throw notAuthorized();

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
