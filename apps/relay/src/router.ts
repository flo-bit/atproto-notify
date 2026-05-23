import {
  ToolsAtmoNotifsDenyPending,
  ToolsAtmoNotifsGetSettings,
  ToolsAtmoNotifsGrant,
  ToolsAtmoNotifsLinkChannel,
  ToolsAtmoNotifsListChannels,
  ToolsAtmoNotifsListGrants,
  ToolsAtmoNotifsListNotifications,
  ToolsAtmoNotifsListPending,
  ToolsAtmoNotifsMuteGrant,
  ToolsAtmoNotifsRegisterDevice,
  ToolsAtmoNotifsRequestPermission,
  ToolsAtmoNotifsRevoke,
  ToolsAtmoNotifsSend,
  ToolsAtmoNotifsUnlinkChannel,
  ToolsAtmoNotifsUpdateSettings,
} from '@atmo/notifs-lexicons';
import { XRPCRouter } from '@atcute/xrpc-server';

import { getVerifier } from './auth/verifier';
import type { AppContext, Env } from './env';
import { makeDenyPending } from './xrpc/denyPending';
import { makeGetSettings } from './xrpc/getSettings';
import { makeGrant } from './xrpc/grant';
import { makeLinkChannel } from './xrpc/linkChannel';
import { makeListChannels } from './xrpc/listChannels';
import { makeListGrants } from './xrpc/listGrants';
import { makeListNotifications } from './xrpc/listNotifications';
import { makeListPending } from './xrpc/listPending';
import { makeMuteGrant } from './xrpc/muteGrant';
import { makeRegisterDevice } from './xrpc/registerDevice';
import { makeRequestPermission } from './xrpc/requestPermission';
import { makeRevoke } from './xrpc/revoke';
import { makeSend } from './xrpc/send';
import { makeUnlinkChannel } from './xrpc/unlinkChannel';
import { makeUpdateSettings } from './xrpc/updateSettings';

/**
 * Build the XRPC router for a single request. Auth + rate limiting live inside
 * each handler (sender path vs user path differ), so there is no global
 * middleware. The router is cheap to construct; the verifier is memoized per Env.
 */
export function buildRouter(env: Env, ctx: ExecutionContext): XRPCRouter {
  const app: AppContext = { env, ctx, verifier: getVerifier(env) };

  const router = new XRPCRouter({
    handleHealthCheck: () => Response.json({ status: 'ok' }),
    onError: ({ error, request }) => {
      // Unexpected errors only (XRPCError subclasses are handled separately).
      // console.error ships to Workers observability / Logpush.
      console.error('unexpected XRPC error', request.url, error);
    },
  });

  // Sender path.
  router.addProcedure(ToolsAtmoNotifsRequestPermission.mainSchema, makeRequestPermission(app));
  router.addProcedure(ToolsAtmoNotifsSend.mainSchema, makeSend(app));

  // User path.
  router.addProcedure(ToolsAtmoNotifsGrant.mainSchema, makeGrant(app));
  router.addProcedure(ToolsAtmoNotifsRevoke.mainSchema, makeRevoke(app));
  router.addProcedure(ToolsAtmoNotifsDenyPending.mainSchema, makeDenyPending(app));
  router.addProcedure(ToolsAtmoNotifsMuteGrant.mainSchema, makeMuteGrant(app));
  router.addProcedure(ToolsAtmoNotifsLinkChannel.mainSchema, makeLinkChannel(app));
  router.addProcedure(ToolsAtmoNotifsUnlinkChannel.mainSchema, makeUnlinkChannel(app));
  router.addProcedure(ToolsAtmoNotifsRegisterDevice.mainSchema, makeRegisterDevice(app));
  router.addProcedure(ToolsAtmoNotifsUpdateSettings.mainSchema, makeUpdateSettings(app));
  router.addQuery(ToolsAtmoNotifsListGrants.mainSchema, makeListGrants(app));
  router.addQuery(ToolsAtmoNotifsListPending.mainSchema, makeListPending(app));
  router.addQuery(ToolsAtmoNotifsListChannels.mainSchema, makeListChannels(app));
  router.addQuery(ToolsAtmoNotifsListNotifications.mainSchema, makeListNotifications(app));
  router.addQuery(ToolsAtmoNotifsGetSettings.mainSchema, makeGetSettings(app));

  return router;
}
