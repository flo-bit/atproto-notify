import { WorkerEntrypoint } from 'cloudflare:workers';

import type { Did } from '@atcute/lexicons';
import type {
  AlertRoute,
  AppInfo,
  AppRoute,
  Capability,
  CategoryRoute,
  ListNotificationsResult,
  MarkReadInput,
  NotifsRpc,
  PushSubscriptionInput,
  RoutingConfig,
  TargetView,
  PubAtmoNotifyDenyPending,
  PubAtmoNotifyGetSettings,
  PubAtmoNotifyGrant,
  PubAtmoNotifyLinkChannel,
  PubAtmoNotifyListGrants,
  PubAtmoNotifyListPending,
  PubAtmoNotifyMuteGrant,
  PubAtmoNotifyRevoke,
  PubAtmoNotifyUpdateSettings,
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
  grant(did: Did, input: PubAtmoNotifyGrant.$input) {
    return ops.grant(this.env, did, input);
  }
  revoke(did: Did, input: PubAtmoNotifyRevoke.$input) {
    return ops.revoke(this.env, did, input);
  }
  denyPending(did: Did, input: PubAtmoNotifyDenyPending.$input) {
    return ops.denyPending(this.env, did, input);
  }
  muteGrant(did: Did, input: PubAtmoNotifyMuteGrant.$input) {
    return ops.muteGrant(this.env, did, input);
  }
  linkChannel(did: Did, input: PubAtmoNotifyLinkChannel.$input, label?: string) {
    return ops.linkChannel(this.env, did, input, label);
  }
  updateSettings(did: Did, input: PubAtmoNotifyUpdateSettings.$input) {
    return ops.updateSettings(this.env, did, input);
  }
  listGrants(did: Did): Promise<PubAtmoNotifyListGrants.$output> {
    return ops.listGrants(this.env, did);
  }
  listPending(did: Did): Promise<PubAtmoNotifyListPending.$output> {
    return ops.listPending(this.env, did);
  }
  getSettings(did: Did): Promise<PubAtmoNotifyGetSettings.$output> {
    return ops.getSettings(this.env, did);
  }
  listTargets(did: Did): Promise<TargetView[]> {
    return ops.listTargets(this.env, did);
  }
  renameTarget(did: Did, id: string, label: string) {
    return ops.renameTarget(this.env, did, id, label);
  }
  removeTarget(did: Did, id: string) {
    return ops.removeTarget(this.env, did, id);
  }
  linkEmail(did: Did, address: string, label?: string) {
    return ops.linkEmail(this.env, did, address, label);
  }
  verifyEmail(did: Did, code: string) {
    return ops.verifyEmail(this.env, did, code);
  }
  addWebhook(did: Did, url: string, label: string) {
    return ops.addWebhook(this.env, did, url, label);
  }
  enableDM(did: Did) {
    return ops.enableDM(this.env, did);
  }
  registerWebPush(did: Did, sub: PushSubscriptionInput) {
    return ops.registerWebPush(this.env, did, sub);
  }
  unregisterWebPush(did: Did, endpoint: string) {
    return ops.unregisterWebPush(this.env, did, endpoint);
  }
  listNotifications(did: Did, cursor?: string): Promise<ListNotificationsResult> {
    return ops.listNotifications(this.env, did, cursor);
  }
  markRead(did: Did, input: MarkReadInput) {
    return ops.markRead(this.env, did, input);
  }
  clearNotificationsFromSender(did: Did, sender: Did) {
    return ops.clearNotificationsFromSender(this.env, did, sender);
  }
  getRouting(did: Did): Promise<RoutingConfig> {
    return ops.getRouting(this.env, did);
  }
  setRouting(did: Did, sender: Did, category: string, route: CategoryRoute) {
    return ops.setRouting(this.env, did, sender, category, route);
  }
  setAppRouting(did: Did, sender: Did, route: AppRoute) {
    return ops.setAppRouting(this.env, did, sender, route);
  }
  setDefaultRoute(did: Did, route: AlertRoute) {
    return ops.setDefaultRoute(this.env, did, route);
  }
  setGrantManage(did: Did, sender: Did, manage: Capability) {
    return ops.setGrantManage(this.env, did, sender, manage);
  }
  verifyAppLogin(token: string): Promise<{ did: Did }> {
    return ops.verifyAppLogin(this.env, token);
  }
  listApps(): Promise<AppInfo[]> {
    return ops.listApps();
  }
}
