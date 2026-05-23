import { ToolsAtmoNotifsRequestPermission } from '@atmo/notifs-lexicons';
import type { Did } from '@atcute/lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifySenderRequest } from '../auth/sender';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { rateLimited } from '../lib/errors';
import { newId } from '../lib/ids';
import { addDays, now } from '../lib/time';
import { ensureSenderProfile } from '../profile/fetch';
import { checkAndIncrement } from '../ratelimit';

const LXM = 'tools.atmo.notifs.requestPermission';

// Per-sender cap on new pending requests: 100 per rolling hour.
const REQ_LIMIT = 100;
const REQ_WINDOW_SECONDS = 60 * 60;

export function makeRequestPermission(
  app: AppContext,
): ProcedureConfig<ToolsAtmoNotifsRequestPermission.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { senderDid } = await verifySenderRequest(app.verifier, request, LXM);
      const recipient = input.recipient;

      // 2. Already granted? Return a stable id and the alreadyGranted status.
      const existingGrant = await q.getGrant(app.env.DB, recipient, senderDid);
      if (existingGrant !== null) {
        return json({ id: pseudoGrantId(recipient, senderDid), status: 'alreadyGranted' });
      }

      // 3. Per-pair pending cap: reuse a live pending request instead of inserting a duplicate.
      const existingPending = await q.getPendingByPair(app.env.DB, recipient, senderDid);
      if (existingPending !== null && existingPending.expires_at > now()) {
        return json({ id: existingPending.id, status: 'pending' });
      }

      // 4. Per-sender global rate limit.
      const rl = await checkAndIncrement(
        app.env.CACHE,
        `rl:req:${senderDid}`,
        REQ_LIMIT,
        REQ_WINDOW_SECONDS,
      );
      if (!rl.allowed) {
        throw rateLimited(rl.resetIn, 'Too many permission requests; try again later');
      }

      // 5. Insert the pending request (replacing any stale/expired row for the pair
      // so the UNIQUE(recipient_did, sender_did) constraint holds).
      if (existingPending !== null) {
        await q.deletePendingByPair(app.env.DB, recipient, senderDid);
      }
      const id = newId();
      const reason = input.reason ?? null;
      const createdAt = now();
      await q.insertPending(app.env.DB, {
        id,
        recipientDid: recipient,
        senderDid,
        reason,
        createdAt,
        expiresAt: addDays(createdAt, 7),
      });

      // 6. Fire-and-forget: refresh the sender profile cache.
      app.ctx.waitUntil(ensureSenderProfile(app.env, senderDid));
      // 7. Fire-and-forget: optionally notify the recipient on Telegram.
      app.ctx.waitUntil(maybeNotifyPending(app, recipient, senderDid, id, reason));

      return json({ id, status: 'pending' });
    },
  };
}

/** A stable, opaque id for the alreadyGranted case (no pending row exists). */
function pseudoGrantId(recipient: Did, senderDid: Did): string {
  return `granted:${recipient}:${senderDid}`;
}

/**
 * If the recipient linked Telegram and opted into pending-request alerts, enqueue
 * a `pendingRequest` job so they can approve/deny from the chat.
 */
async function maybeNotifyPending(
  app: AppContext,
  recipient: Did,
  senderDid: Did,
  requestId: string,
  reason: string | null,
): Promise<void> {
  const user = await q.getUser(app.env.DB, recipient);
  if (user === null || user.notify_pending_via_telegram !== 1) {
    return;
  }
  const channels = await q.listChannelsForDid(app.env.DB, recipient);
  const telegram = channels.find((channel) => channel.platform === 'telegram');
  if (telegram === undefined) {
    return;
  }

  const sender = await q.getSender(app.env.DB, senderDid);
  await app.env.DISPATCH_QUEUE.send({
    kind: 'pendingRequest',
    channel: { platform: 'telegram', platformUserId: telegram.platform_user_id },
    requestId,
    senderHandle: sender?.handle ?? senderDid,
    senderDisplayName: sender?.display_name ?? undefined,
    reason: reason ?? undefined,
  });
}
