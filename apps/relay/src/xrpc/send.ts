import { PubAtmoNotifySend, routeSelection } from '@atmo/notifs-lexicons';
import type { Did } from '@atcute/lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifySenderRequest } from '../auth/sender';
import * as q from '../db/queries';
import { deliveryChannelFor, selectTargets } from '../delivery/channel';
import { withinChannelLimits } from '../delivery/limits';
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

      // 3. Rate limits (per recipient+sender pair) — checked before any write so a
      //    rate-limited send has no side effects (no inbox row, no category).
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
        route = (await q.getUser(app.env.DB, recipient))?.default_route ?? 'inbox';
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

      // 4. Resolve the token set against the user's deliverable targets. A bare
      //    channel ('push') fires all its instances; 'push:<id>' fires just one.
      const matched = selectTargets(
        await q.listDeliveryTargets(app.env.DB, recipient),
        routeSelection(route),
      );

      // 5. Apply per-channel daily caps (per-recipient + relay-global, e.g. email).
      //    A channel over its cap is skipped for this notification — it's still
      //    recorded in the inbox above; uncapped channels pass without touching the
      //    limiter. Sequential so the relay-global counter is consumed accurately.
      const targets: typeof matched = [];
      for (const target of matched) {
        if (await withinChannelLimits(app.env, target.channel, recipient)) {
          targets.push(target);
        }
      }
      const deliveredCount = targets.length;

      // No targets → accept but deliver to nobody.
      if (deliveredCount === 0) {
        await logDelivery(app, id, recipient, senderDid, input.title, 0);
        return json({ id, delivered: 0 });
      }

      // 5. Enqueue one dispatch job per matched target.
      const jobs = targets.map((target) => ({
        body: {
          kind: 'notification' as const,
          channel: deliveryChannelFor(target),
          title: input.title,
          body: input.body,
          uri: input.uri,
          senderDid,
        } satisfies DispatchJob,
      }));
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
