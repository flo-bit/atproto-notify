import { PubAtmoNotifyRequestPermission } from '@atmo/notifs-lexicons';
import type { Did } from '@atcute/lexicons';
import { isDid } from '@atcute/lexicons/syntax';
import { InvalidRequestError, json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyUserRequest } from '../auth/user';
import * as q from '../db/queries';
import type { AppContext } from '../env';
import { rateLimited } from '../lib/errors';
import { newId } from '../lib/ids';
import { addDays, now } from '../lib/time';
import { isTrustedSender } from '../lib/apps';
import { ensureSenderProfile } from '../profile/fetch';
import { checkAndIncrement } from '../ratelimit';

const LXM = 'pub.atmo.notify.requestPermission';

// New pending-request caps, both per rolling hour.
const PER_RECIPIENT_LIMIT = 50; // NEW: stops one OAuth'd app spamming a user
const PER_SENDER_LIMIT = 100; // unchanged from the original design
const WINDOW_SECONDS = 60 * 60;

export function makeRequestPermission(
  app: AppContext,
): ProcedureConfig<PubAtmoNotifyRequestPermission.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      // Auth flipped to the user path: the JWT issuer is the recipient (the user
      // who'd receive notifications). The sender DID is supplied in the body.
      const { userDid } = await verifyUserRequest(app.verifier, request, LXM);
      const senderDid = input.senderDid;

      // 1. Validate the sender DID (router already enforces `format: did`; this
      //    keeps the contract explicit and surfaces InvalidRequest).
      if (!isDid(senderDid)) {
        throw new InvalidRequestError({ message: 'senderDid is not a valid DID' });
      }

      // 2. Ensure the user row exists.
      await q.ensureUser(app.env.DB, userDid, now());

      // Auto-allow policy gates the auto-grant: 'all' grants anyone, 'trusted'
      // only TRUSTED_SENDERS, 'none' always requires manual approval.
      const policy = (await q.getUser(app.env.DB, userDid))?.auto_allow ?? 'trusted';
      if (policy === 'all' || (policy === 'trusted' && isTrustedSender(senderDid))) {
        await q.upsertGrant(app.env.DB, {
          recipientDid: userDid,
          senderDid,
          grantedAt: now(),
          title: input.title,
          description: input.description ?? null,
          iconUrl: input.iconUrl ?? null,
        });
        return json({ id: pseudoGrantId(userDid, senderDid), status: 'alreadyGranted' });
      }

      // 3. Already granted? Short-circuit.
      const existingGrant = await q.getGrant(app.env.DB, userDid, senderDid);
      if (existingGrant !== null) {
        return json({ id: pseudoGrantId(userDid, senderDid), status: 'alreadyGranted' });
      }

      // 4. Per-pair pending cap: reuse a live pending request instead of duplicating.
      const existingPending = await q.getPendingByPair(app.env.DB, userDid, senderDid);
      if (existingPending !== null && existingPending.expires_at > now()) {
        return json({ id: existingPending.id, status: 'pending' });
      }

      // 5. Rate limits: per recipient (new) and per sender DID (unchanged).
      const perRecipient = await checkAndIncrement(
        app.env.CACHE,
        `rl:req:recipient:${userDid}`,
        PER_RECIPIENT_LIMIT,
        WINDOW_SECONDS,
      );
      if (!perRecipient.allowed) {
        throw rateLimited(perRecipient.resetIn, 'Too many permission requests for this account');
      }
      const perSender = await checkAndIncrement(
        app.env.CACHE,
        `rl:req:sender:${senderDid}`,
        PER_SENDER_LIMIT,
        WINDOW_SECONDS,
      );
      if (!perSender.allowed) {
        throw rateLimited(perSender.resetIn, 'Too many permission requests from this sender');
      }

      // 6. Insert the pending request (replacing any stale row for the pair so the
      //    UNIQUE(recipient_did, sender_did) constraint holds).
      if (existingPending !== null) {
        await q.deletePendingByPair(app.env.DB, userDid, senderDid);
      }
      const id = newId();
      const createdAt = now();
      const description = input.description ?? null;
      const iconUrl = input.iconUrl ?? null;
      await q.insertPending(app.env.DB, {
        id,
        recipientDid: userDid,
        senderDid,
        title: input.title,
        description,
        iconUrl,
        createdAt,
        expiresAt: addDays(createdAt, 7),
      });

      // 7. Fire-and-forget: refresh the sender's Bluesky profile cache (informational
      //    "verified on Bluesky" fallback for the dashboard).
      app.ctx.waitUntil(ensureSenderProfile(app.env, senderDid));
      // 8. Fire-and-forget: optionally notify the recipient on Telegram.
      app.ctx.waitUntil(
        maybeNotifyPending(app, userDid, senderDid, id, input.title, description, iconUrl),
      );

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
  title: string,
  description: string | null,
  iconUrl: string | null,
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

  await app.env.DISPATCH_QUEUE.send({
    kind: 'pendingRequest',
    channel: { platform: 'telegram', platformUserId: telegram.platform_user_id },
    requestId,
    senderTitle: title,
    senderDescription: description ?? undefined,
    senderIconUrl: iconUrl ?? undefined,
    senderDid,
  });
}
