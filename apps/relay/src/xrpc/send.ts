import { ToolsAtmoNotifsSend } from '@atmo/notifs-lexicons';
import type { Did } from '@atcute/lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifySenderRequest } from '../auth/sender';
import * as q from '../db/queries';
import type { AppContext, DispatchJob } from '../env';
import { notAuthorized, rateLimited } from '../lib/errors';
import { newId } from '../lib/ids';
import { now } from '../lib/time';
import { checkAndIncrement } from '../ratelimit';

const LXM = 'tools.atmo.notifs.send';

// Per-pair limits: at most 1 notification/second and 100/day.
const PER_SECOND_LIMIT = 1;
const PER_SECOND_WINDOW = 1;
const PER_DAY_LIMIT = 100;
const PER_DAY_WINDOW = 24 * 60 * 60;

export function makeSend(app: AppContext): ProcedureConfig<ToolsAtmoNotifsSend.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { senderDid } = await verifySenderRequest(app.verifier, request, LXM);
      const recipient = input.recipient;
      const id = newId();

      // 2. Must have an active grant. Muted grants accept silently (delivered: 0).
      const grant = await q.getGrant(app.env.DB, recipient, senderDid);
      if (grant === null) {
        throw notAuthorized();
      }
      if (grant.muted === 1) {
        await logDelivery(app, id, recipient, senderDid, input, 0);
        return json({ id, delivered: 0 });
      }

      // 3. Rate limits (per recipient+sender pair).
      const perSecond = await checkAndIncrement(
        app.env.CACHE,
        `rl:send:1s:${senderDid}:${recipient}`,
        PER_SECOND_LIMIT,
        PER_SECOND_WINDOW,
      );
      if (!perSecond.allowed) {
        throw rateLimited(perSecond.resetIn, 'Sending too fast');
      }
      const perDay = await checkAndIncrement(
        app.env.CACHE,
        `rl:send:1d:${senderDid}:${recipient}`,
        PER_DAY_LIMIT,
        PER_DAY_WINDOW,
      );
      if (!perDay.allowed) {
        throw rateLimited(perDay.resetIn, 'Daily notification limit reached for this recipient');
      }

      // 4. No linked channels → accept but deliver to nobody.
      const channels = await q.listChannelsForDid(app.env.DB, recipient);
      if (channels.length === 0) {
        await logDelivery(app, id, recipient, senderDid, input, 0);
        return json({ id, delivered: 0 });
      }

      // 5. Enqueue one dispatch job per channel (telegram + mobile). The sender's
      // handle (if cached) rides along so the device can render it before sync.
      const sender = await q.getSender(app.env.DB, senderDid);
      const senderHandle = sender?.handle ?? undefined;
      const jobs = channels.map(
        (channel): { body: DispatchJob } => ({
          body: {
            kind: 'notification',
            channel: {
              platform: channel.platform as DispatchJob['channel']['platform'],
              platformUserId: channel.platform_user_id,
            },
            notifId: id,
            title: input.title,
            body: input.body,
            uri: input.uri,
            senderDid,
            senderHandle,
          },
        }),
      );
      await app.env.DISPATCH_QUEUE.sendBatch(jobs);

      // 6. Record the delivery.
      await logDelivery(app, id, recipient, senderDid, input, channels.length);
      return json({ id, delivered: channels.length });
    },
  };
}

function logDelivery(
  app: AppContext,
  id: string,
  recipient: Did,
  senderDid: Did,
  input: { title: string; body: string; uri?: string },
  deliveredCount: number,
): Promise<void> {
  return q.insertDeliveryLog(app.env.DB, {
    id,
    recipientDid: recipient,
    senderDid,
    title: input.title,
    body: input.body,
    uri: input.uri ?? null,
    deliveredCount,
    createdAt: now(),
  });
}
