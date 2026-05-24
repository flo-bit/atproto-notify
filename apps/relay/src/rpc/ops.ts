// First-party management operations — the logic formerly in src/xrpc/*.ts for
// every user method except `requestPermission`. These run ONLY behind the
// `RelayRpc` service-binding entrypoint (./entrypoint.ts), so there is no auth,
// no `Request`, and no `json()` wrapper here: the binding is the security
// boundary and `did` is the already-authenticated user the caller vouches for.
import type { Did } from '@atcute/lexicons';

import type {
  AlertRoute,
  AppInfo,
  AppRoute,
  Capability,
  CategoryRoute,
  ListNotificationsResult,
  MarkReadInput,
  NotificationView,
  PushSubscriptionInput,
  RouteInstance,
  RouteInstances,
  RoutingApp,
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

import { emptyRouteInstances } from '@atmo/notifs-lexicons';

import { verifyAppLoginToken } from '../auth/appLogin';
import { sendEmail } from '../delivery/email';
import * as q from '../db/queries';
import type { Env } from '../env';
import { appCatalog, callbackAppFor } from '../lib/apps';
import { invalidRequest } from '../lib/errors';
import { newLinkToken, newTargetId } from '../lib/ids';
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

  await notifySubscriberChanged(env, did, input.sender, true);
  return { granted: true };
}

/**
 * If `sender` is a registered callback app, enqueue a relay→app `subscriberChanged`
 * callback. Fire-and-forget via the dispatch queue (Queues handles retries); a
 * delivery failure must not fail the grant/revoke the user just made.
 */
async function notifySubscriberChanged(
  env: Env,
  recipient: Did,
  sender: Did,
  enabled: boolean,
): Promise<void> {
  if (callbackAppFor(sender) === undefined) {
    return;
  }
  await env.DISPATCH_QUEUE.send({
    kind: 'subscriberChanged',
    sender,
    recipient,
    enabled,
    changedAt: toIsoDatetime(now()),
  });
}

export async function revoke(
  env: Env,
  did: Did,
  input: PubAtmoNotifyRevoke.$input,
): Promise<PubAtmoNotifyRevoke.$output> {
  const revoked = await q.deleteGrant(env.DB, did, input.sender);
  // The pending request (if any) for this pair is now irrelevant.
  await q.deletePendingByPair(env.DB, did, input.sender);

  if (revoked) {
    await notifySubscriberChanged(env, did, input.sender, false);
  }
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
  label?: string,
): Promise<PubAtmoNotifyLinkChannel.$output> {
  await q.ensureUser(env.DB, did, now());
  const token = newLinkToken();
  const name = label?.trim().slice(0, 64);
  await q.insertLinkToken(env.DB, {
    token,
    did,
    platform: input.platform,
    label: name && name.length > 0 ? name : null,
    expiresAt: addMinutes(now(), 10),
  });

  const deepLink = `https://t.me/${env.BOT_USERNAME}?start=${token}`;
  return { token, deepLink };
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

/** All of the user's delivery targets (push devices, Telegram chats, emails). */
export async function listTargets(env: Env, did: Did): Promise<TargetView[]> {
  const rows = await q.listDeliveryTargets(env.DB, did);
  const views: TargetView[] = [];
  for (const row of rows) {
    const createdAt = toIsoDatetime(row.created_at);
    if (row.channel === 'push') {
      views.push({ id: row.id, channel: 'push', label: row.label ?? 'Unknown device', endpoint: row.ref, createdAt });
    } else if (row.channel === 'telegram') {
      views.push({ id: row.id, channel: 'telegram', label: row.label ?? 'Telegram', createdAt });
    } else if (row.channel === 'email') {
      views.push({
        id: row.id,
        channel: 'email',
        label: row.label ?? row.ref,
        address: row.ref,
        verified: row.verified === 1,
        createdAt,
      });
    } else if (row.channel === 'dm') {
      views.push({ id: row.id, channel: 'dm', label: row.label ?? 'Bluesky DM', createdAt });
    } else if (row.channel === 'webhook') {
      const url = (JSON.parse(row.config || '{}') as { url?: string }).url ?? '';
      views.push({ id: row.id, channel: 'webhook', label: row.label ?? 'Webhook', url, createdAt });
    }
  }
  return views;
}

/**
 * Enable Bluesky DM delivery: the relay's bot account DMs this user. The
 * recipient is always the user's own DID, so `ref` = `did` (one DM target per
 * user, enforced by UNIQUE(channel, ref)) and there's no address or verification
 * step — it's deliverable immediately. Idempotent: re-enabling keeps the same
 * target (and any user-chosen name). Disable via `removeTarget`.
 */
export async function enableDM(env: Env, did: Did): Promise<{ ok: boolean }> {
  await q.ensureUser(env.DB, did, now());
  await q.upsertDeliveryTarget(env.DB, {
    id: newTargetId(),
    did,
    channel: 'dm',
    ref: did, // DM to self
    label: null, // defaults to 'Bluesky DM'; user can rename
    verified: true,
    config: {},
    createdAt: now(),
  });
  return { ok: true };
}

/** Give any delivery target a friendly name. */
export async function renameTarget(
  env: Env,
  did: Did,
  id: string,
  label: string,
): Promise<{ ok: boolean }> {
  const ok = await q.renameDeliveryTargetById(env.DB, did, id, label);
  return { ok };
}

/** Remove any delivery target by its id (a Telegram chat, an email, a device). */
export async function removeTarget(env: Env, did: Did, id: string): Promise<{ ok: boolean }> {
  const ok = await q.deleteDeliveryTargetById(env.DB, did, id);
  return { ok };
}

export async function getSettings(
  env: Env,
  did: Did,
): Promise<PubAtmoNotifyGetSettings.$output> {
  // Ensure the row exists so we return stored defaults rather than guessing.
  await q.ensureUser(env.DB, did, now());
  const user = await q.getUser(env.DB, did);
  const pushDevices = (await q.countDeliveryTargets(env.DB, did, 'push'))?.c ?? 0;

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
  await q.upsertDeliveryTarget(env.DB, {
    id: newTargetId(),
    did,
    channel: 'push',
    ref: sub.endpoint,
    label: sub.label ?? null,
    named: sub.named ?? false,
    verified: true,
    config: { p256dh: sub.p256dh, auth: sub.auth },
    createdAt: now(),
  });
  return { registered: true };
}

export async function unregisterWebPush(
  env: Env,
  did: Did,
  endpoint: string,
): Promise<{ unregistered: boolean }> {
  const unregistered = await q.deleteDeliveryTarget(env.DB, did, 'push', endpoint);
  return { unregistered };
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

/** Permanently delete every notification from one app for this user. */
export async function clearNotificationsFromSender(
  env: Env,
  did: Did,
  sender: Did,
): Promise<{ deleted: number }> {
  const deleted = await q.deleteNotificationsFromSender(env.DB, did, sender);
  return { deleted };
}

export async function getRouting(env: Env, did: Did): Promise<RoutingConfig> {
  await q.ensureUser(env.DB, did, now());
  const user = await q.getUser(env.DB, did);
  const defaultRoute = (user?.default_route ?? 'push') as AlertRoute;

  const [grants, categories, routing, appRouting, deliveryTargets] = await Promise.all([
    q.listGrantsForRecipient(env.DB, did),
    q.listAppCategoriesForRecipient(env.DB, did),
    q.listRoutingForRecipient(env.DB, did),
    q.listAppRoutingForRecipient(env.DB, did),
    q.listDeliveryTargets(env.DB, did),
  ]);

  // The user's deliverable instances per channel, so a route can target just one
  // (e.g. one of several push devices). Only verified targets can be routed to.
  const channels: RouteInstances = emptyRouteInstances();
  for (const row of deliveryTargets) {
    const inst = q.toDeliveryInstance(row);
    if (inst !== null && inst.verified) {
      channels[inst.channel].push({ id: inst.id, label: inst.label } satisfies RouteInstance);
    }
  }

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
    manage: g.manage as Capability,
    muted: g.muted === 1,
    iconUrl: g.icon_url ?? g.avatar_url ?? undefined,
    categories: (catsBySender.get(g.sender_did) ?? []).map((c) => ({
      category: c.category,
      description: c.description ?? undefined,
      route: (routeBy.get(`${g.sender_did} ${c.category}`) ?? 'app') as CategoryRoute,
    })),
  }));

  return { defaultRoute, apps, channels };
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

/** Designate an app's management capability for this user. See MANAGEMENT-AUTH.md. */
export async function setGrantManage(
  env: Env,
  did: Did,
  sender: Did,
  manage: Capability,
): Promise<{ ok: boolean }> {
  await q.setGrantManage(env.DB, did, sender, manage);
  return { ok: true };
}

// --- email channel ---------------------------------------------------------

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const VERIFY_TTL_MS = 15 * 60 * 1000;

function genVerifyCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return (n % 1_000_000).toString().padStart(6, '0');
}

/**
 * Add an email address and email it a verification code (via comail). Stored
 * unverified until `verifyEmail` succeeds. Throws if comail rejects, so nothing
 * is stored for an undeliverable address. A user can link several addresses;
 * re-linking the same one just re-sends a fresh code. An optional `label` is the
 * user's chosen name (named = 1, shown to apps); without one the address itself
 * is the label (named = 0, hidden from apps).
 */
export async function linkEmail(
  env: Env,
  did: Did,
  address: string,
  label?: string,
): Promise<{ ok: boolean }> {
  const addr = address.trim().toLowerCase();
  if (!EMAIL_RE.test(addr)) throw invalidRequest('Invalid email address');

  // `ref` is globally unique per channel; don't let one user grab an address
  // already linked to another (which would break the owner's delivery).
  const existing = await q.getDeliveryTargetByRef(env.DB, 'email', addr);
  if (existing !== null && existing.did !== did) {
    throw invalidRequest('That email is already linked to another account');
  }

  const code = genVerifyCode();
  await sendEmail(env, {
    to: addr,
    subject: 'Verify your email for atmo.pub',
    text: `Your atmo.pub verification code is ${code}.\n\nIt expires in 15 minutes. If you didn't request this, you can ignore this email.`,
    category: 'verification',
  });

  const name = label?.trim().slice(0, 64);
  const hasName = name !== undefined && name.length > 0;
  const t = now();
  // Re-linking the same address keeps its id (and any name) but resets it to
  // unverified with a fresh code via ON CONFLICT(channel, ref).
  await q.upsertDeliveryTarget(env.DB, {
    id: existing?.id ?? newTargetId(),
    did,
    channel: 'email',
    ref: addr,
    label: hasName ? name : addr,
    named: hasName,
    verified: false,
    config: { code, expires: t + VERIFY_TTL_MS },
    createdAt: t,
  });
  return { ok: true };
}

export async function verifyEmail(env: Env, did: Did, code: string): Promise<{ verified: boolean }> {
  const verified = await q.verifyEmailTarget(env.DB, did, code.trim(), now());
  return { verified };
}

// --- webhook channel -------------------------------------------------------

const WEBHOOK_LABEL_MAX = 64;

/**
 * Reject hostnames that resolve to the local machine or a private network. This
 * is defense-in-depth against SSRF: a user can only POST to a URL they entered,
 * but we still don't want the relay reaching loopback/link-local/RFC1918 ranges.
 * (Hostname-based, so a public name with a private A record isn't caught — Worker
 * fetch can't reach the internal network from the edge regardless.)
 */
function isNonPublicHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '[::1]') return true;
  // IPv4 literals in private / loopback / link-local ranges.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  // IPv6 unique-local (fc00::/7) / link-local (fe80::/10) literals.
  if (h.startsWith('[fc') || h.startsWith('[fd') || h.startsWith('[fe8') || h.startsWith('[fe9') || h.startsWith('[fea') || h.startsWith('[feb')) {
    return true;
  }
  return false;
}

/** Validate + normalize a user-supplied webhook URL (https, public host). */
function normalizeWebhookUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw invalidRequest('Invalid webhook URL');
  }
  if (url.protocol !== 'https:') throw invalidRequest('Webhook URL must use https://');
  if (isNonPublicHost(url.hostname)) throw invalidRequest('Webhook URL must be a public address');
  return url.toString();
}

/**
 * Add a webhook target: the relay POSTs notification JSON to `url`. The URL is
 * validated (https, public host) and the user-supplied label is stored. No
 * verification step — the user controls the endpoint — so it's deliverable
 * immediately. `ref` is `<did> <url>`, so the same URL can be a target for
 * several users while staying deduped per user (re-adding is idempotent).
 */
export async function addWebhook(
  env: Env,
  did: Did,
  url: string,
  label: string,
): Promise<{ ok: boolean }> {
  await q.ensureUser(env.DB, did, now());
  const normalized = normalizeWebhookUrl(url);
  const name = label.trim().slice(0, WEBHOOK_LABEL_MAX);
  if (name.length === 0) throw invalidRequest('Webhook label is required');

  await q.upsertDeliveryTarget(env.DB, {
    id: newTargetId(),
    did,
    channel: 'webhook',
    ref: `${did} ${normalized}`,
    label: name,
    named: true, // the label is user-supplied at creation
    verified: true,
    config: { url: normalized },
    createdAt: now(),
  });
  return { ok: true };
}

/**
 * Cross-app login: verify a `pub.atmo.auth` service-auth token and return the
 * issuer DID, ensuring the user row exists. Pre-auth — no leading `did`, the DID
 * is the result. The web app's /applogin route consumes it to mint a session.
 */
export async function verifyAppLogin(env: Env, token: string): Promise<{ did: Did }> {
  const { did } = await verifyAppLoginToken(env, token);
  await q.ensureUser(env.DB, did, now());
  return { did };
}

/** The hardcoded catalog of enableable apps (see ../lib/apps). */
export function listApps(): Promise<AppInfo[]> {
  return Promise.resolve(appCatalog());
}
