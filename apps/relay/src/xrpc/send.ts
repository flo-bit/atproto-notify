import { PubAtmoNotifySend, routeSelection } from '@atmo/notifs-lexicons';
import type { Did } from '@atcute/lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifySenderRequest } from '../auth/sender';
import * as q from '../db/queries';
import { deliveryChannelFor, selectTargets } from '../delivery/channel';
import { withinChannelLimits } from '../delivery/limits';
import type { AppContext, DispatchJob } from '../env';
import { invalidRequest, notAuthorized, rateLimited } from '../lib/errors';
import { newId } from '../lib/ids';
import { now } from '../lib/time';
import { checkAndIncrement } from '../ratelimit';

const LXM = 'pub.atmo.notify.send';

// The lexicon leaves `uri` an unconstrained string, but it crosses a trust
// boundary: it's rendered as an inbox anchor href, a Telegram "Open" button URL,
// and a Bluesky DM link facet. An unvalidated value lets a granted sender inject
// a `javascript:` URI (stored XSS in the atmo.pub origin) or a `tg:`/other-scheme
// link delivered through the relay's own trusted channels (phishing). So require
// a real http(s) URL with a sane length cap here, at the single send boundary —
// covering every downstream channel at once.
const URI_MAX_LENGTH = 2048;

/**
 * Validate a sender-supplied notification link. Returns the value unchanged when
 * it's a valid http(s) URL within the length cap, undefined when none was given;
 * throws InvalidRequest otherwise. Allows both http and https to match the
 * client-side guards (the inbox `/go` page and the service worker accept
 * `^https?://`).
 */
function validateUri(uri: string | undefined): string | undefined {
  if (uri === undefined) return undefined;
  if (uri.length > URI_MAX_LENGTH) {
    throw invalidRequest('uri exceeds maximum length');
  }
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw invalidRequest('uri must be a valid absolute URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw invalidRequest('uri must use http(s)');
  }
  return uri;
}

/**
 * Return `value` only if it's a valid http(s) URL within the length cap, else
 * undefined. Used for actor `avatarImage`/`url`: both become an inbox `<img src>`
 * / `<a href>`, so the same trust boundary as {@link validateUri} applies (a
 * `javascript:` href would be stored XSS). Unlike the link, a bad actor field is
 * just dropped — it's decoration, not worth failing the whole send over.
 */
function safeHttpUrl(value: string | undefined): string | undefined {
  if (value === undefined || value.length > URI_MAX_LENGTH) return undefined;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Sanitize sender-supplied actors for storage: drop unsafe avatar/profile URLs. */
function sanitizeActors(
  actors: PubAtmoNotifySend.$input['actors'],
): q.NotificationActorRecord[] | null {
  if (!actors) return null;
  return actors.map((a) => ({
    did: a.did,
    handle: a.handle,
    avatarImage: safeHttpUrl(a.avatarImage),
    url: safeHttpUrl(a.url),
  }));
}

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

      // Validate the optional link before any side effects (no inbox row, no
      // rate-limit slot consumed for a malformed request). See validateUri.
      const uri = validateUri(input.uri);
      const actors = sanitizeActors(input.actors);

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
        uri: uri ?? null,
        actors,
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
          notificationId: id,
          title: input.title,
          body: input.body,
          uri,
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
