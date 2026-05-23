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

      // Record in the inbox (full history) for every accepted send — mute/routing
      // only affect which alert channels fire, not whether it's recorded.
      await q.insertNotification(app.env.DB, {
        id,
        recipientDid: recipient,
        senderDid,
        category: input.category ?? null,
        title: input.title,
        body: input.body,
        uri: input.uri ?? null,
        actors: input.actors ?? null,
        createdAt: now(),
      });

      // Register the category so it shows up in the routing UI.
      if (input.category != null) {
        await q.upsertAppCategory(app.env.DB, {
          recipientDid: recipient,
          senderDid,
          category: input.category,
          description: input.categoryDescription ?? null,
          lastSeen: now(),
        });
      }

      if (grant.muted === 1) {
        await logDelivery(app, id, recipient, senderDid, input.title, 0);
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

      // 4. Resolve the alert route: per-category override → app-wide → account
      //    default. Everything is already in the inbox; the route only gates which
      //    alert channels fire.
      let route: string | undefined;
      if (input.category != null) {
        route = (await q.getRoutingRoute(app.env.DB, recipient, senderDid, input.category))?.route;
      }
      if (route === undefined) {
        route = (await q.getAppRoute(app.env.DB, recipient, senderDid))?.route;
      }
      if (route === undefined) {
        route = (await q.getUser(app.env.DB, recipient))?.default_route ?? 'push';
      }
      const usePush = route === 'push' || route === 'push+telegram';
      const useTelegram = route === 'telegram' || route === 'push+telegram';

      const telegramChannels = useTelegram
        ? (await q.listChannelsForDid(app.env.DB, recipient)).filter((c) => c.platform === 'telegram')
        : [];
      const pushSubs = usePush ? await q.listPushSubscriptionsForDid(app.env.DB, recipient) : [];
      const deliveredCount = telegramChannels.length + pushSubs.length;

      // No targets → accept but deliver to nobody.
      if (deliveredCount === 0) {
        await logDelivery(app, id, recipient, senderDid, input.title, 0);
        return json({ id, delivered: 0 });
      }

      // 5. Enqueue one dispatch job per target.
      const jobs: { body: DispatchJob }[] = [
        ...telegramChannels.map((channel) => ({
          body: {
            kind: 'notification' as const,
            channel: { platform: 'telegram' as const, platformUserId: channel.platform_user_id },
            title: input.title,
            body: input.body,
            uri: input.uri,
            senderDid,
          },
        })),
        ...pushSubs.map((sub) => ({
          body: {
            kind: 'notification' as const,
            channel: {
              platform: 'webpush' as const,
              endpoint: sub.endpoint,
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
            title: input.title,
            body: input.body,
            uri: input.uri,
            senderDid,
          },
        })),
      ];
      await app.env.DISPATCH_QUEUE.sendBatch(jobs);

      // 6. Record the delivery.
      await logDelivery(app, id, recipient, senderDid, input.title, deliveredCount);
      return json({ id, delivered: deliveredCount });
    },
  };
}

function logDelivery(
  app: AppContext,
  id: string,
  recipient: Did,
  senderDid: Did,
  title: string,
  deliveredCount: number,
): Promise<void> {
  return q.insertDeliveryLog(app.env.DB, {
    id,
    recipientDid: recipient,
    senderDid,
    title,
    deliveredCount,
    createdAt: now(),
  });
}
