import { WorkerEntrypoint } from 'cloudflare:workers';

import type { Did } from '@atcute/lexicons';
import type {
  AlertRoute,
  AppInfo,
  AppRoute,
  Capability,
  CategoryRoute,
  DeviceView,
  EmailChannelView,
  ListNotificationsResult,
  MarkReadInput,
  NotifsRpc,
  PushSubscriptionInput,
  RoutingConfig,
  PubAtmoNotifyDenyPending,
  PubAtmoNotifyGetSettings,
  PubAtmoNotifyGrant,
  PubAtmoNotifyLinkChannel,
  PubAtmoNotifyListChannels,
  PubAtmoNotifyListGrants,
  PubAtmoNotifyListPending,
  PubAtmoNotifyMuteGrant,
  PubAtmoNotifyRevoke,
  PubAtmoNotifyUnlinkChannel,
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
  linkChannel(did: Did, input: PubAtmoNotifyLinkChannel.$input) {
    return ops.linkChannel(this.env, did, input);
  }
  unlinkChannel(did: Did, input: PubAtmoNotifyUnlinkChannel.$input) {
    return ops.unlinkChannel(this.env, did, input);
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
  listChannels(did: Did): Promise<PubAtmoNotifyListChannels.$output> {
    return ops.listChannels(this.env, did);
  }
  getSettings(did: Did): Promise<PubAtmoNotifyGetSettings.$output> {
    return ops.getSettings(this.env, did);
  }
  linkEmail(did: Did, address: string) {
    return ops.linkEmail(this.env, did, address);
  }
  verifyEmail(did: Did, code: string) {
    return ops.verifyEmail(this.env, did, code);
  }
  unlinkEmail(did: Did) {
    return ops.unlinkEmail(this.env, did);
  }
  getEmailChannel(did: Did): Promise<EmailChannelView | null> {
    return ops.getEmailChannel(this.env, did);
  }
  registerWebPush(did: Did, sub: PushSubscriptionInput) {
    return ops.registerWebPush(this.env, did, sub);
  }
  unregisterWebPush(did: Did, endpoint: string) {
    return ops.unregisterWebPush(this.env, did, endpoint);
  }
  listDevices(did: Did): Promise<DeviceView[]> {
    return ops.listDevices(this.env, did);
  }
  renameDevice(did: Did, endpoint: string, label: string) {
    return ops.renameDevice(this.env, did, endpoint, label);
  }
  listNotifications(did: Did, cursor?: string): Promise<ListNotificationsResult> {
    return ops.listNotifications(this.env, did, cursor);
  }
  markRead(did: Did, input: MarkReadInput) {
    return ops.markRead(this.env, did, input);
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
