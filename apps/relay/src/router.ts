import {
  PubAtmoNotifyGetRouting,
  PubAtmoNotifyListNotifications,
  PubAtmoNotifyManage,
  PubAtmoNotifyMarkRead,
  PubAtmoNotifyMuteSelf,
  PubAtmoNotifyRequestPermission,
  PubAtmoNotifyRevokeSelf,
  PubAtmoNotifySend,
  PubAtmoNotifySetRouting,
} from '@atmo/notifs-lexicons';
import { XRPCRouter } from '@atcute/xrpc-server';

import { getVerifier } from './auth/verifier';
import type { AppContext, Env } from './env';
import { makeGetRouting } from './xrpc/getRouting';
import { makeListNotifications } from './xrpc/listNotifications';
import { makeManage } from './xrpc/manage';
import { makeMarkRead } from './xrpc/markRead';
import { makeMuteSelf } from './xrpc/muteSelf';
import { makeRequestPermission } from './xrpc/requestPermission';
import { makeRevokeSelf } from './xrpc/revokeSelf';
import { makeSend } from './xrpc/send';
import { makeSetRouting } from './xrpc/setRouting';

/**
 * Build the XRPC router for a single request. This is the relay's *federated*
 * surface — the only methods third-party atproto apps interact with:
 *   - `requestPermission` (user-OAuth): an app asks a user for notify permission.
 *   - `send` (sender-DID): an approved sender delivers a notification.
 *   - `setRouting` / `getRouting` (dual-auth: app JWT + user consent JWT): an
 *     app reads/writes how *its own* notifications are routed for a user.
 *   - `listNotifications` / `markRead` (same dual-auth): an app reads/acks the
 *     notifications *it* sent to a user (with read state + delivery counts).
 *   - `revokeSelf` / `muteSelf` (same dual-auth): an app turns itself off / mutes
 *     itself for a user. All five self-scoped methods go through
 *     `verifyManagementCall` (capability + self-policy; see MANAGEMENT-AUTH.md).
 *   - `manage` (vouch or dual-auth, `full` only): whole-account management for a
 *     designated manager app — the portable counterpart to the service binding.
 *
 * Every first-party user-management method (grant, revoke, the list/get
 * queries, settings, and so on) lives behind the `RelayRpc` service-binding
 * entrypoint instead (see ./rpc/), so it is unreachable from the public
 * internet. Auth + rate limiting live inside each handler; the verifier is
 * memoized per Env.
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

  router.addProcedure(PubAtmoNotifyRequestPermission.mainSchema, makeRequestPermission(app));
  router.addProcedure(PubAtmoNotifySend.mainSchema, makeSend(app));
  router.addProcedure(PubAtmoNotifySetRouting.mainSchema, makeSetRouting(app));
  router.addProcedure(PubAtmoNotifyGetRouting.mainSchema, makeGetRouting(app));
  router.addProcedure(PubAtmoNotifyListNotifications.mainSchema, makeListNotifications(app));
  router.addProcedure(PubAtmoNotifyMarkRead.mainSchema, makeMarkRead(app));
  router.addProcedure(PubAtmoNotifyRevokeSelf.mainSchema, makeRevokeSelf(app));
  router.addProcedure(PubAtmoNotifyMuteSelf.mainSchema, makeMuteSelf(app));
  router.addProcedure(PubAtmoNotifyManage.mainSchema, makeManage(app));

  return router;
}
