import { PubAtmoNotifySend, routeSelection } from '@atmo/notifs-lexicons';
import type { Did } from '@atcute/lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifySenderRequest } from '../auth/sender';
import * as q from '../db/queries';
import type { AppContext, DispatchJob } from '../env';
import { notAuthorized, rateLimited } from '../lib/errors';
import { newId } from '../lib/ids';
import { now } from '../lib/time';
import { checkAndIncrement } from '../ratelimit';

const LXM = 'pub.atmo.notify.send';

// Per-pair limits: at most 1 notification/second and 100/day.
const PER_SECOND_LIMIT = 1;
const PER_SECOND_WINDOW = 1;
const PER_DAY_LIMIT = 100;
const PER_DAY_WINDOW = 24 * 60 * 60;

export function makeSend(app: AppContext): ProcedureConfig<PubAtmoNotifySend.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { senderDid } = await verifySenderRequest(app.verifier, request, LXM);
      const recipient = input.recipient;
      const id = newId();

      // 2. Must have an active grant.
      const grant = await q.getGrant(app.env.DB, recipient, senderDid);
      if (grant === null) {
        throw notAuthorized();
      }

      // Register the category up front so it stays configurable in the routing UI
      // even when this notification is dropped (route 'off').
      if (input.category != null) {
        await q.upsertAppCategory(app.env.DB, {
          recipientDid: recipient,
          senderDid,
          category: input.category,
          description: input.categoryDescription ?? null,
          lastSeen: now(),
        });
      }

      // 3. Resolve the route: per-category override → app-wide → account default.
      //    Absent rows mean "inherit"; the resolved value is concrete:
      //    'off' (drop) | 'inbox' (record, no alerts) | a channel-token set.
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

      // 'off' → dropped entirely: not recorded, not delivered.
      if (route === 'off') {
        return json({ id, delivered: 0 });
      }

      // Everything else is recorded in the inbox (the canonical history).
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

      // A muted grant or the 'inbox' route records but fires no alert channels.
      if (grant.muted === 1 || route === 'inbox') {
        await logDelivery(app, id, recipient, senderDid, input.title, 0);
        return json({ id, delivered: 0 });
      }

      // 4. Rate limits (per recipient+sender pair) — only for actual alert delivery.
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

      // 5. Resolve the token set against the user's deliverable targets. A bare
      //    channel ('push') fires all its instances; 'push:<id>' fires just one.
      const selection = routeSelection(route);
      const targets = (await q.listDeliveryTargets(app.env.DB, recipient))
        .map(q.toDeliveryInstance)
        .filter((t): t is q.DeliveryInstance => t !== null && t.verified)
        .filter((t) => {
          const sel = selection[t.channel];
          return sel !== undefined && (sel.all || sel.ids.includes(t.id));
        });
      const deliveredCount = targets.length;

      // No targets → accept but deliver to nobody.
      if (deliveredCount === 0) {
        await logDelivery(app, id, recipient, senderDid, input.title, 0);
        return json({ id, delivered: 0 });
      }

      // 5. Enqueue one dispatch job per matched target.
      const jobs = targets.map((target) => ({
        body: toNotificationJob(target, input, senderDid),
      }));
      await app.env.DISPATCH_QUEUE.sendBatch(jobs);

      // 6. Record the delivery.
      await logDelivery(app, id, recipient, senderDid, input.title, deliveredCount);
      return json({ id, delivered: deliveredCount });
    },
  };
}

/** Build a notification dispatch job for one resolved delivery instance. */
function toNotificationJob(
  target: q.DeliveryInstance,
  input: { title: string; body: string; uri?: string },
  senderDid: string,
): DispatchJob {
  const common = {
    kind: 'notification' as const,
    title: input.title,
    body: input.body,
    uri: input.uri,
    senderDid,
  };
  if (target.channel === 'push') {
    return {
      ...common,
      channel: {
        platform: 'webpush',
        endpoint: target.endpoint,
        p256dh: target.p256dh,
        auth: target.auth,
      },
    };
  }
  if (target.channel === 'telegram') {
    return { ...common, channel: { platform: 'telegram', platformUserId: target.chatId } };
  }
  if (target.channel === 'email') {
    return { ...common, channel: { platform: 'email', address: target.address } };
  }
  if (target.channel === 'dm') {
    return { ...common, channel: { platform: 'dm', recipientDid: target.recipientDid } };
  }
  return { ...common, channel: { platform: 'webhook', url: target.url } };
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
