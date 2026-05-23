import { WorkerEntrypoint } from 'cloudflare:workers';

import type { Did } from '@atcute/lexicons';
import type {
  NotifsRpc,
  ToolsAtmoNotifsDenyPending,
  ToolsAtmoNotifsGetSettings,
  ToolsAtmoNotifsGrant,
  ToolsAtmoNotifsLinkChannel,
  ToolsAtmoNotifsListChannels,
  ToolsAtmoNotifsListGrants,
  ToolsAtmoNotifsListPending,
  ToolsAtmoNotifsMuteGrant,
  ToolsAtmoNotifsRevoke,
  ToolsAtmoNotifsUnlinkChannel,
  ToolsAtmoNotifsUpdateSettings,
} from '@atmo/notifs-lexicons';

import type { Env } from '../env';
import * as ops from './ops';

/**
 * Private, first-party management API: the relay's 11 user-management methods,
 * reachable ONLY via a Cloudflare service binding from the web app's server
 * (apps/web/wrangler.jsonc → services[].entrypoint = "RelayRpc"). There is no
 * public route and no JWT — only bound Workers can call this, so the binding is
 * the security boundary and `did` is the authenticated user the caller vouches
 * for. The federated surface (`requestPermission`, `send`) stays on the public
 * XRPC router (../router.ts). `implements NotifsRpc` keeps this in lockstep with
 * the shared contract the web app types its binding against.
 */
export class RelayRpc extends WorkerEntrypoint<Env> implements NotifsRpc {
  grant(did: Did, input: ToolsAtmoNotifsGrant.$input) {
    return ops.grant(this.env, did, input);
  }
  revoke(did: Did, input: ToolsAtmoNotifsRevoke.$input) {
    return ops.revoke(this.env, did, input);
  }
  denyPending(did: Did, input: ToolsAtmoNotifsDenyPending.$input) {
    return ops.denyPending(this.env, did, input);
  }
  muteGrant(did: Did, input: ToolsAtmoNotifsMuteGrant.$input) {
    return ops.muteGrant(this.env, did, input);
  }
  linkChannel(did: Did, input: ToolsAtmoNotifsLinkChannel.$input) {
    return ops.linkChannel(this.env, did, input);
  }
  unlinkChannel(did: Did, input: ToolsAtmoNotifsUnlinkChannel.$input) {
    return ops.unlinkChannel(this.env, did, input);
  }
  updateSettings(did: Did, input: ToolsAtmoNotifsUpdateSettings.$input) {
    return ops.updateSettings(this.env, did, input);
  }
  listGrants(did: Did): Promise<ToolsAtmoNotifsListGrants.$output> {
    return ops.listGrants(this.env, did);
  }
  listPending(did: Did): Promise<ToolsAtmoNotifsListPending.$output> {
    return ops.listPending(this.env, did);
  }
  listChannels(did: Did): Promise<ToolsAtmoNotifsListChannels.$output> {
    return ops.listChannels(this.env, did);
  }
  getSettings(did: Did): Promise<ToolsAtmoNotifsGetSettings.$output> {
    return ops.getSettings(this.env, did);
  }
}
