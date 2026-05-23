import { PubAtmoNotifyGetRouting } from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import * as q from '../db/queries';
import type { AppContext } from '../env';

const LXM = 'pub.atmo.notify.getRouting';

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

      const [user, appRoute, cats, routes] = await Promise.all([
        q.getUser(app.env.DB, userDid),
        q.getAppRoute(app.env.DB, userDid, senderDid),
        q.listAppCategoriesForSender(app.env.DB, userDid, senderDid),
        q.listRoutingForSender(app.env.DB, userDid, senderDid),
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
      });
    },
  };
}
