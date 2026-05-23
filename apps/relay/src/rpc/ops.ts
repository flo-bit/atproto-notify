// First-party management operations — the logic formerly in src/xrpc/*.ts for
// every user method except `requestPermission`. These run ONLY behind the
// `RelayRpc` service-binding entrypoint (./entrypoint.ts), so there is no auth,
// no `Request`, and no `json()` wrapper here: the binding is the security
// boundary and `did` is the already-authenticated user the caller vouches for.
import type { Did } from '@atcute/lexicons';

import type {
  AlertRoute,
  AppRoute,
  CategoryRoute,
  DeviceView,
  ListNotificationsResult,
  MarkReadInput,
  NotificationView,
  PushSubscriptionInput,
  RoutingApp,
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

import * as q from '../db/queries';
import type { Env } from '../env';
import { newLinkToken } from '../lib/ids';
import { addMinutes, now, toIsoDatetime } from '../lib/time';

export async function grant(
  env: Env,
  did: Did,
  input: PubAtmoNotifyGrant.$input,
): Promise<PubAtmoNotifyGrant.$output> {
  await q.ensureUser(env.DB, did, now());

  // When granting from a pending request, copy its display metadata onto the
  // grant so listGrants can show it later. For a manual grant (no requestId)
  // the metadata stays null and listGrants falls back to Bluesky-resolved info.
  const pending =
    input.requestId !== undefined ? await q.getPendingById(env.DB, input.requestId) : null;
  const fromPending = pending !== null && pending.recipient_did === did ? pending : null;

  await q.upsertGrant(env.DB, {
    recipientDid: did,
    senderDid: input.sender,
    grantedAt: now(),
    title: fromPending?.title ?? null,
    description: fromPending?.description ?? null,
    iconUrl: fromPending?.icon_url ?? null,
  });

  if (input.requestId !== undefined) {
    await q.deletePendingById(env.DB, input.requestId, did);
  }

  return { granted: true };
}

export async function revoke(
  env: Env,
  did: Did,
  input: PubAtmoNotifyRevoke.$input,
): Promise<PubAtmoNotifyRevoke.$output> {
  const revoked = await q.deleteGrant(env.DB, did, input.sender);
  // The pending request (if any) for this pair is now irrelevant.
  await q.deletePendingByPair(env.DB, did, input.sender);

  return { revoked };
}

export async function denyPending(
  env: Env,
  did: Did,
  input: PubAtmoNotifyDenyPending.$input,
): Promise<PubAtmoNotifyDenyPending.$output> {
  // Delete the pending request without granting. Does not blocklist the sender;
  // they may request again once rate limits allow.
  const denied = await q.deletePendingById(env.DB, input.requestId, did);

  return { denied };
}

export async function muteGrant(
  env: Env,
  did: Did,
  input: PubAtmoNotifyMuteGrant.$input,
): Promise<PubAtmoNotifyMuteGrant.$output> {
  await q.setGrantMuted(env.DB, did, input.sender, input.muted);

  return { muted: input.muted };
}

export async function linkChannel(
  env: Env,
  did: Did,
  input: PubAtmoNotifyLinkChannel.$input,
): Promise<PubAtmoNotifyLinkChannel.$output> {
  await q.ensureUser(env.DB, did, now());
  const token = newLinkToken();
  await q.insertLinkToken(env.DB, {
    token,
    did,
    platform: input.platform,
    expiresAt: addMinutes(now(), 10),
  });

  const deepLink = `https://t.me/${env.BOT_USERNAME}?start=${token}`;
  return { token, deepLink };
}

export async function unlinkChannel(
  env: Env,
  did: Did,
  input: PubAtmoNotifyUnlinkChannel.$input,
): Promise<PubAtmoNotifyUnlinkChannel.$output> {
  const unlinked = await q.deleteChannel(env.DB, did, input.platform);

  return { unlinked };
}

export async function updateSettings(
  env: Env,
  did: Did,
  input: PubAtmoNotifyUpdateSettings.$input,
): Promise<PubAtmoNotifyUpdateSettings.$output> {
  await q.ensureUser(env.DB, did, now());

  // Partial PATCH: only touch fields present in the input.
  if (input.notifyPendingViaTelegram !== undefined) {
    await q.setNotifyPending(env.DB, did, input.notifyPendingViaTelegram);
  }
  if (input.autoAllow !== undefined) {
    await q.setAutoAllow(env.DB, did, input.autoAllow);
  }

  const user = await q.getUser(env.DB, did);
  return {
    notifyPendingViaTelegram: (user?.notify_pending_via_telegram ?? 0) === 1,
  };
}

export async function listGrants(
  env: Env,
  did: Did,
): Promise<PubAtmoNotifyListGrants.$output> {
  const rows = await q.listGrantsForRecipient(env.DB, did);

  return {
    grants: rows.map((row) => ({
      sender: row.sender_did,
      // user-supplied title; fall back to the Bluesky name/handle, then the DID
      title: row.title ?? row.display_name ?? row.handle ?? row.sender_did,
      description: row.description ?? undefined,
      iconUrl: row.icon_url ?? undefined,
      senderHandle: row.handle ?? undefined,
      senderBskyDisplayName: row.display_name ?? undefined,
      senderBskyAvatar: row.avatar_url ?? undefined,
      grantedAt: toIsoDatetime(row.granted_at),
      muted: row.muted === 1,
    })),
  };
}

export async function listPending(
  env: Env,
  did: Did,
): Promise<PubAtmoNotifyListPending.$output> {
  const rows = await q.listPendingForRecipient(env.DB, did, now());

  return {
    pending: rows.map((row) => ({
      id: row.id,
      sender: row.sender_did,
      // user-supplied display metadata (fall back to the DID for title)
      title: row.title ?? row.sender_did,
      description: row.description ?? undefined,
      iconUrl: row.icon_url ?? undefined,
      // best-effort Bluesky profile (informational "verified on Bluesky")
      senderHandle: row.handle ?? undefined,
      senderBskyDisplayName: row.display_name ?? undefined,
      senderBskyAvatar: row.avatar_url ?? undefined,
      createdAt: toIsoDatetime(row.created_at),
      expiresAt: toIsoDatetime(row.expires_at),
    })),
  };
}

export async function listChannels(
  env: Env,
  did: Did,
): Promise<PubAtmoNotifyListChannels.$output> {
  const rows = await q.listChannelsForDid(env.DB, did);

  return {
    channels: rows.map((row) => ({
      platform: row.platform,
      linkedAt: toIsoDatetime(row.linked_at),
      displayName: row.display_name ?? undefined,
    })),
  };
}

export async function getSettings(
  env: Env,
  did: Did,
): Promise<PubAtmoNotifyGetSettings.$output> {
  // Ensure the row exists so we return stored defaults rather than guessing.
  await q.ensureUser(env.DB, did, now());
  const user = await q.getUser(env.DB, did);
  const pushDevices = (await q.countPushSubscriptionsForDid(env.DB, did))?.c ?? 0;

  return {
    notifyPendingViaTelegram: (user?.notify_pending_via_telegram ?? 0) === 1,
    autoAllow: (user?.auto_allow ?? 'trusted') as 'all' | 'trusted' | 'none',
    pushDevices,
  };
}

export async function registerWebPush(
  env: Env,
  did: Did,
  sub: PushSubscriptionInput,
): Promise<{ registered: boolean }> {
  await q.ensureUser(env.DB, did, now());
  await q.upsertPushSubscription(env.DB, {
    endpoint: sub.endpoint,
    did,
    p256dh: sub.p256dh,
    auth: sub.auth,
    label: sub.label ?? null,
    createdAt: now(),
  });
  return { registered: true };
}

export async function unregisterWebPush(
  env: Env,
  did: Did,
  endpoint: string,
): Promise<{ unregistered: boolean }> {
  const unregistered = await q.deletePushSubscriptionForDid(env.DB, did, endpoint);
  return { unregistered };
}

export async function listDevices(env: Env, did: Did): Promise<DeviceView[]> {
  const rows = await q.listPushSubscriptionsForDid(env.DB, did);
  return rows.map((row) => ({
    endpoint: row.endpoint,
    label: row.label ?? 'Unknown device',
    createdAt: toIsoDatetime(row.created_at),
  }));
}

export async function renameDevice(
  env: Env,
  did: Did,
  endpoint: string,
  label: string,
): Promise<{ ok: boolean }> {
  const ok = await q.renamePushSubscription(env.DB, did, endpoint, label);
  return { ok };
}

const INBOX_PAGE_SIZE = 30;

function toNotificationView(row: q.NotificationRow): NotificationView {
  return {
    id: row.id,
    sender: row.sender_did,
    category: row.category ?? undefined,
    title: row.title,
    body: row.body,
    uri: row.uri ?? undefined,
    actors: row.actors ? (JSON.parse(row.actors) as string[]) : [],
    createdAt: toIsoDatetime(row.created_at),
    read: row.read_at !== null,
  };
}

export async function listNotifications(
  env: Env,
  did: Did,
  cursor?: string,
): Promise<ListNotificationsResult> {
  const before = cursor !== undefined ? Number(cursor) : undefined;
  const rows = await q.listNotificationsForRecipient(env.DB, did, INBOX_PAGE_SIZE, before);
  const unread = (await q.countUnreadNotifications(env.DB, did))?.c ?? 0;
  const last = rows.at(-1);
  return {
    notifications: rows.map(toNotificationView),
    unread,
    cursor: rows.length === INBOX_PAGE_SIZE && last ? String(last.created_at) : undefined,
  };
}

export async function markRead(
  env: Env,
  did: Did,
  input: MarkReadInput,
): Promise<{ marked: number }> {
  const readAt = now();
  const marked = input.all
    ? await q.markAllNotificationsRead(env.DB, did, readAt)
    : await q.markNotificationsRead(env.DB, did, input.ids ?? [], readAt);
  return { marked };
}

export async function getRouting(env: Env, did: Did): Promise<RoutingConfig> {
  await q.ensureUser(env.DB, did, now());
  const user = await q.getUser(env.DB, did);
  const defaultRoute = (user?.default_route ?? 'push') as AlertRoute;

  const [grants, categories, routing, appRouting] = await Promise.all([
    q.listGrantsForRecipient(env.DB, did),
    q.listAppCategoriesForRecipient(env.DB, did),
    q.listRoutingForRecipient(env.DB, did),
    q.listAppRoutingForRecipient(env.DB, did),
  ]);

  const routeBy = new Map<string, string>();
  for (const r of routing) routeBy.set(`${r.sender_did} ${r.category}`, r.route);

  const appRouteBy = new Map<string, string>();
  for (const a of appRouting) appRouteBy.set(a.sender_did, a.route);

  const catsBySender = new Map<string, q.AppCategoryRow[]>();
  for (const c of categories) {
    const list = catsBySender.get(c.sender_did) ?? [];
    list.push(c);
    catsBySender.set(c.sender_did, list);
  }

  const apps: RoutingApp[] = grants.map((g) => ({
    sender: g.sender_did,
    title: g.title ?? g.display_name ?? g.handle ?? g.sender_did,
    route: (appRouteBy.get(g.sender_did) ?? 'default') as AppRoute,
    categories: (catsBySender.get(g.sender_did) ?? []).map((c) => ({
      category: c.category,
      description: c.description ?? undefined,
      route: (routeBy.get(`${g.sender_did} ${c.category}`) ?? 'app') as CategoryRoute,
    })),
  }));

  return { defaultRoute, apps };
}

export async function setRouting(
  env: Env,
  did: Did,
  sender: Did,
  category: string,
  route: CategoryRoute,
): Promise<{ ok: boolean }> {
  if (route === 'app') {
    await q.deleteRouting(env.DB, did, sender, category);
  } else {
    await q.upsertRouting(env.DB, did, sender, category, route);
  }
  return { ok: true };
}

export async function setAppRouting(
  env: Env,
  did: Did,
  sender: Did,
  route: AppRoute,
): Promise<{ ok: boolean }> {
  if (route === 'default') {
    await q.deleteAppRoute(env.DB, did, sender);
  } else {
    await q.upsertAppRoute(env.DB, did, sender, route);
  }
  return { ok: true };
}

export async function setDefaultRoute(
  env: Env,
  did: Did,
  route: AlertRoute,
): Promise<{ ok: boolean }> {
  await q.ensureUser(env.DB, did, now());
  await q.setDefaultRoute(env.DB, did, route);
  return { ok: true };
}
