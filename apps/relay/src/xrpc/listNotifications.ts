import { PubAtmoNotifyListNotifications } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifySenderRequest, verifyServiceToken } from '../auth/sender';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { notAuthorized } from '../lib/errors';

const LXM = 'pub.atmo.notify.listNotifications';
const DEFAULT_LIMIT = 50;

/**
 * Let an app page the notifications *it* sent to a user, with read state and
 * the per-notification delivery count. Dual-authenticated and grant-gated like
 * setRouting; results are scoped to (userDid, senderDid) so an app only ever
 * sees its own notifications. Cursor is the `created_at` of the last row.
 */
export function makeListNotifications(
  app: AppContext,
): ProcedureConfig<PubAtmoNotifyListNotifications.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { senderDid } = await verifySenderRequest(app.verifier, request, LXM);
      const { did: userDid } = await verifyServiceToken(app.verifier, input.userToken, LXM);

      if (userDid === senderDid) throw notAuthorized();
      if ((await q.getGrant(app.env.DB, userDid, senderDid)) === null) throw notAuthorized();

      const limit = input.limit ?? DEFAULT_LIMIT;
      let before: number | undefined;
      if (input.cursor !== undefined) {
        const n = Number(input.cursor);
        if (Number.isFinite(n)) before = n;
      }

      const rows = await q.listNotificationsFromSender(app.env.DB, userDid, senderDid, limit, before);
      const last = rows.at(-1);

      return json({
        notifications: rows.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          uri: r.uri ?? undefined,
          category: r.category ?? undefined,
          createdAt: new Date(r.created_at).toISOString(),
          read: r.read_at !== null,
          delivered: r.delivered_count ?? undefined,
        })),
        // Only emit a cursor when the page was full (more rows may remain).
        cursor: last !== undefined && rows.length === limit ? String(last.created_at) : undefined,
      });
    },
  };
}
