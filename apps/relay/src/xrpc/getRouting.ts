import { PubAtmoNotifyGetRouting } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import * as q from '../db/queries';
import type { AppContext } from '../env';

const LXM = 'pub.atmo.notify.getRouting';

// Privacy-safe generic labels per channel (no PII), with a capitalized-id fallback.
const GENERIC_LABEL: Record<string, string> = {
  push: 'Push device',
  telegram: 'Telegram',
  email: 'Email',
  dm: 'Direct message',
  webhook: 'Webhook',
};
const genericLabel = (channel: string): string =>
  GENERIC_LABEL[channel] ?? channel.charAt(0).toUpperCase() + channel.slice(1);

/**
 * Build the app-facing target catalog. Labels never leak the raw email
 * address / telegram handle: a user-chosen name (`named`) is used as-is; push
 * device labels (a UA descriptor, not PII) pass through; everything else gets a
 * generic label, numbered when a channel has more than one target.
 */
function safeTargets(rows: q.DeliveryTargetRow[]): { type: string; id: string; label: string }[] {
  const verified = rows.filter((r) => r.verified === 1);
  const counts: Record<string, number> = {};
  for (const r of verified) counts[r.channel] = (counts[r.channel] ?? 0) + 1;
  const seen: Record<string, number> = {};
  return verified.map((r) => {
    const n = (seen[r.channel] ?? 0) + 1;
    seen[r.channel] = n;
    let label: string;
    if (r.named === 1 && r.label) label = r.label;
    else if (r.channel === 'push' && r.label) label = r.label;
    else label = (counts[r.channel] ?? 0) > 1 ? `${genericLabel(r.channel)} ${n}` : genericLabel(r.channel);
    return { type: r.channel, id: r.id, label };
  });
}

/**
 * Read how the calling app's own notifications are currently routed for a user,
 * so the app can render an accurate in-app settings UI. A self-scoped management
 * read (see MANAGEMENT-AUTH.md); returns only this app's slice plus the
 * account-default value (so 'default'/'app' can be labelled by the caller).
 */
export function makeGetRouting(
  app: AppContext,
): ProcedureConfig<PubAtmoNotifyGetRouting.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const { appDid: senderDid, userDid } = await verifyManagementCall(app, request, input, {
        scope: 'self',
        write: false,
        lxm: LXM,
      });

      const [user, appRoute, cats, routes, deliveryTargets] = await Promise.all([
        q.getUser(app.env.DB, userDid),
        q.getAppRoute(app.env.DB, userDid, senderDid),
        q.listAppCategoriesForSender(app.env.DB, userDid, senderDid),
        q.listRoutingForSender(app.env.DB, userDid, senderDid),
        q.listDeliveryTargets(app.env.DB, userDid),
      ]);

      const routeByCategory = new Map(routes.map((r) => [r.category, r.route]));

      // DB columns are plain strings; cast to the lexicon's route unions at the
      // boundary (values were validated when written).
      type Out = PubAtmoNotifyGetRouting.$output;
      return json({
        route: (appRoute?.route ?? 'default') as Out['route'],
        defaultRoute: (user?.default_route ?? 'push') as Out['defaultRoute'],
        categories: cats.map(
          (c): PubAtmoNotifyGetRouting.Category => ({
            id: c.category,
            description: c.description ?? undefined,
            route: (routeByCategory.get(c.category) ?? 'app') as PubAtmoNotifyGetRouting.Category['route'],
          }),
        ),
        targets: safeTargets(deliveryTargets),
      });
    },
  };
}
