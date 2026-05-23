import { ToolsAtmoNotifsListNotifications } from '@atmo/notifs-lexicons';
import type { Did } from '@atcute/lexicons';
import { json, type QueryConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { toIsoDatetime } from '../lib/time';

const LXM = 'tools.atmo.notifs.listNotifications';

/** Opaque keyset cursor: "<created_at>:<id>". */
function encodeCursor(row: { created_at: number; id: string }): string {
  return `${row.created_at}:${row.id}`;
}

function decodeCursor(cursor: string | undefined): { createdAt: number; id: string } | undefined {
  if (cursor === undefined) {
    return undefined;
  }
  const sep = cursor.indexOf(':');
  if (sep === -1) {
    return undefined; // malformed → treat as "from the top"
  }
  const createdAt = Number(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  if (!Number.isSafeInteger(createdAt) || id === '') {
    return undefined;
  }
  return { createdAt, id };
}

export function makeListNotifications(
  app: AppContext,
): QueryConfig<ToolsAtmoNotifsListNotifications.mainSchema> {
  return {
    handler: async ({ request, params }) => {
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);
      const limit = params.limit ?? 50;

      // Fetch one extra row to know whether another page exists.
      const rows = await q.listNotificationsForRecipient(app.env.DB, {
        recipientDid: userDid,
        limit: limit + 1,
        cursor: decodeCursor(params.cursor),
        senderDid: params.senderDid as Did | undefined,
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page[page.length - 1];

      return json({
        notifications: page.map((row) => ({
          id: row.id,
          sender: row.sender_did,
          senderHandle: row.handle ?? undefined,
          senderDisplayName: row.display_name ?? undefined,
          senderAvatar: row.avatar_url ?? undefined,
          title: row.title ?? '',
          body: row.body ?? '',
          uri: row.uri ?? undefined,
          createdAt: toIsoDatetime(row.created_at),
        })),
        cursor: hasMore && last !== undefined ? encodeCursor(last) : undefined,
      });
    },
  };
}
