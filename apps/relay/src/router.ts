import { PubAtmoNotifyRequestPermission, PubAtmoNotifySend } from '@atmo/notifs-lexicons';
import { XRPCRouter } from '@atcute/xrpc-server';

import { getVerifier } from './auth/verifier';
import type { AppContext, Env } from './env';
import { makeRequestPermission } from './xrpc/requestPermission';
import { makeSend } from './xrpc/send';

/**
 * Build the XRPC router for a single request. This is the relay's *federated*
 * surface — the only methods third-party atproto apps interact with:
 *   - `requestPermission` (user-OAuth): an app asks a user for notify permission.
 *   - `send` (sender-DID): an approved sender delivers a notification.
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

  return router;
}
