import type { ToolsAtmoNotifsListNotifications } from '@atmo/notifs-lexicons';

import type { OAuthSession } from '../auth/client';
import { LEXICON_PREFIX } from '../config';
import { callRelay } from '../relay/client';
import { getNewestCreatedAt, insertNotification, pruneOld } from './notifications';

/**
 * Reconcile the local inbox with the relay. Fetches the newest page and inserts
 * anything we don't already have (INSERT OR IGNORE dedups by id). The local
 * newest timestamp is the floor — once a fetched item is older, we stop.
 */
export async function syncFromRelay(session: OAuthSession): Promise<number> {
  const floor = await getNewestCreatedAt();

  const res = await callRelay<ToolsAtmoNotifsListNotifications.$output>(
    session,
    `${LEXICON_PREFIX}.listNotifications`,
    { limit: 100 },
    'GET',
  );

  let inserted = 0;
  for (const n of res.notifications) {
    const createdAt = Date.parse(n.createdAt);
    if (Number.isNaN(createdAt) || createdAt <= floor) {
      // Reached items we already have (page is newest-first).
      break;
    }
    await insertNotification({
      id: n.id,
      senderDid: n.sender,
      senderHandle: n.senderHandle ?? null,
      senderDisplayName: n.senderDisplayName ?? null,
      senderAvatar: n.senderAvatar ?? null,
      title: n.title,
      body: n.body,
      uri: n.uri ?? null,
      createdAt,
    });
    inserted++;
  }

  if (inserted > 0) {
    await pruneOld();
  }
  return inserted;
}
