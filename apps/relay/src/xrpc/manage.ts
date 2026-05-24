import type { Did } from '@atcute/lexicons';
import {
  PubAtmoNotifyManage,
  type AlertRoute,
  type AppRoute,
  type CategoryRoute,
  type MarkReadInput,
  type PubAtmoNotifyDenyPending,
  type PubAtmoNotifyGrant,
  type PubAtmoNotifyLinkChannel,
  type PubAtmoNotifyMuteGrant,
  type PubAtmoNotifyRevoke,
  type PubAtmoNotifyUnlinkChannel,
  type PubAtmoNotifyUpdateSettings,
  type PushSubscriptionInput,
} from '@atmo/notifs-lexicons';
import { json, type ProcedureConfig } from '@atcute/xrpc-server';

import { verifyManagementCall } from '../auth/management';
import type { AppContext, Env } from '../env';
import { invalidRequest } from '../lib/errors';
import * as ops from '../rpc/ops';

const LXM = 'pub.atmo.notify.manage';

// One envelope over the whole-account (`full`) management surface. Every entry
// delegates to the same `ops.*` the service binding uses, so there's a single
// implementation. `params` is the lexicon's `unknown` payload; we cast it to the
// op's input at the boundary (callers are designated `full` managers). The auth
// gate (`verifyManagementCall` at `scope: 'full'`) runs before any op.
type OpFn = (env: Env, did: Did, params: unknown) => Promise<unknown>;

const OPS: Record<string, OpFn> = {
  // reads
  listGrants: (env, did) => ops.listGrants(env, did),
  listPending: (env, did) => ops.listPending(env, did),
  listChannels: (env, did) => ops.listChannels(env, did),
  getSettings: (env, did) => ops.getSettings(env, did),
  listDevices: (env, did) => ops.listDevices(env, did),
  getEmailChannel: (env, did) => ops.getEmailChannel(env, did),
  getRouting: (env, did) => ops.getRouting(env, did),
  listNotifications: (env, did, p) =>
    ops.listNotifications(env, did, (p as { cursor?: string } | undefined)?.cursor),
  // writes
  grant: (env, did, p) => ops.grant(env, did, p as PubAtmoNotifyGrant.$input),
  revoke: (env, did, p) => ops.revoke(env, did, p as PubAtmoNotifyRevoke.$input),
  denyPending: (env, did, p) => ops.denyPending(env, did, p as PubAtmoNotifyDenyPending.$input),
  muteGrant: (env, did, p) => ops.muteGrant(env, did, p as PubAtmoNotifyMuteGrant.$input),
  linkChannel: (env, did, p) => ops.linkChannel(env, did, p as PubAtmoNotifyLinkChannel.$input),
  unlinkChannel: (env, did, p) =>
    ops.unlinkChannel(env, did, p as PubAtmoNotifyUnlinkChannel.$input),
  linkEmail: (env, did, p) => ops.linkEmail(env, did, (p as { address: string }).address),
  verifyEmail: (env, did, p) => ops.verifyEmail(env, did, (p as { code: string }).code),
  unlinkEmail: (env, did) => ops.unlinkEmail(env, did),
  updateSettings: (env, did, p) =>
    ops.updateSettings(env, did, p as PubAtmoNotifyUpdateSettings.$input),
  registerWebPush: (env, did, p) => ops.registerWebPush(env, did, p as PushSubscriptionInput),
  unregisterWebPush: (env, did, p) =>
    ops.unregisterWebPush(env, did, (p as { endpoint: string }).endpoint),
  renameDevice: (env, did, p) => {
    const { endpoint, label } = p as { endpoint: string; label: string };
    return ops.renameDevice(env, did, endpoint, label);
  },
  markRead: (env, did, p) => ops.markRead(env, did, p as MarkReadInput),
  setRouting: (env, did, p) => {
    const { sender, category, route } = p as { sender: Did; category: string; route: CategoryRoute };
    return ops.setRouting(env, did, sender, category, route);
  },
  setAppRouting: (env, did, p) => {
    const { sender, route } = p as { sender: Did; route: AppRoute };
    return ops.setAppRouting(env, did, sender, route);
  },
  setDefaultRoute: (env, did, p) =>
    ops.setDefaultRoute(env, did, (p as { route: AlertRoute }).route),
};

/**
 * `pub.atmo.notify.manage` — whole-account management for `full` managers (see
 * MANAGEMENT-AUTH.md). The portable counterpart to the service binding; both
 * call `ops.*`. Vouch or dual-auth; `full` is always designation-gated.
 */
export function makeManage(app: AppContext): ProcedureConfig<PubAtmoNotifyManage.mainSchema> {
  return {
    handler: async ({ request, input }) => {
      const op = OPS[input.method];
      if (op === undefined) throw invalidRequest(`Unknown management method: ${input.method}`);

      const { userDid } = await verifyManagementCall(app, request, input, {
        scope: 'full',
        write: true, // unused at `full` scope (no read/write split there)
        lxm: LXM,
      });

      const result = await op(app.env, userDid, input.params);
      // `result` is the lexicon's freeform `unknown`; cast at the boundary (it may
      // be an array/object/void depending on the op — JSON-serialized as-is).
      return json(result === undefined ? {} : { result: result as Record<string, unknown> });
    },
  };
}
