import type { Did } from '@atcute/lexicons';

// Row shapes mirror migrations/0001_init.sql. D1 returns plain JSON; we treat
// the `.first()/.all()` boundary as the place to assert these types (DID columns
// are branded `Did`). Booleans are stored as 0/1 integers.

export interface UserRow {
  did: Did;
  created_at: number;
  notify_pending_via_telegram: number;
  default_route: string;
  auto_allow: string;
}

export interface ChannelRow {
  did: Did;
  platform: string;
  platform_user_id: string;
  display_name: string | null;
  linked_at: number;
}

export interface LinkTokenRow {
  token: string;
  did: Did;
  platform: string;
  expires_at: number;
}

export interface SenderRow {
  did: Did;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_fetched_at: number | null;
}

export interface PendingRequestRow {
  id: string;
  recipient_did: Did;
  sender_did: Did;
  reason: string | null; // legacy (migration 0001); unused
  title: string | null;
  description: string | null;
  icon_url: string | null;
  created_at: number;
  expires_at: number;
}

export interface GrantRow {
  recipient_did: Did;
  sender_did: Did;
  granted_at: number;
  muted: number;
  title: string | null;
  description: string | null;
  icon_url: string | null;
  /** Management capability the user designated for this app: 'none'|'self'|'full'. */
  manage: string;
}

/** A grant joined with the (optional) cached Bluesky profile (`s.*`). */
export interface GrantWithSenderRow extends GrantRow {
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

/** A pending request joined with the (optional) cached Bluesky profile (`s.*`). */
export interface PendingWithSenderRow extends PendingRequestRow {
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

const toInt = (b: boolean): number => (b ? 1 : 0);
const changed = (result: D1Result): boolean => (result.meta.changes ?? 0) > 0;

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export function getUser(db: D1Database, did: Did): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE did = ?').bind(did).first<UserRow>();
}

/** Insert a users row if absent. No-op when it already exists. */
export async function ensureUser(db: D1Database, did: Did, createdAt: number): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO users (did, created_at, notify_pending_via_telegram) VALUES (?, ?, 0)')
    .bind(did, createdAt)
    .run();
}

export async function setNotifyPending(db: D1Database, did: Did, value: boolean): Promise<void> {
  await db
    .prepare('UPDATE users SET notify_pending_via_telegram = ? WHERE did = ?')
    .bind(toInt(value), did)
    .run();
}

// ---------------------------------------------------------------------------
// channels
// ---------------------------------------------------------------------------

export async function listChannelsForDid(db: D1Database, did: Did): Promise<ChannelRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM channels WHERE did = ? ORDER BY linked_at DESC')
    .bind(did)
    .all<ChannelRow>();
  return results;
}

export function getChannelByPlatformUser(
  db: D1Database,
  platform: string,
  platformUserId: string,
): Promise<ChannelRow | null> {
  return db
    .prepare('SELECT * FROM channels WHERE platform = ? AND platform_user_id = ?')
    .bind(platform, platformUserId)
    .first<ChannelRow>();
}

export interface UpsertChannelInput {
  did: Did;
  platform: string;
  platformUserId: string;
  displayName: string | null;
  linkedAt: number;
}

/**
 * Insert/replace a channel. `INSERT OR REPLACE` also clears any existing row
 * that collides on the `(platform, platform_user_id)` unique index, so linking
 * a Telegram account that was previously tied to another DID moves it cleanly.
 */
export async function upsertChannel(db: D1Database, input: UpsertChannelInput): Promise<void> {
  await db
    .prepare(
      'INSERT OR REPLACE INTO channels (did, platform, platform_user_id, display_name, linked_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(input.did, input.platform, input.platformUserId, input.displayName, input.linkedAt)
    .run();
}

export async function deleteChannel(db: D1Database, did: Did, platform: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM channels WHERE did = ? AND platform = ?')
    .bind(did, platform)
    .run();
  return changed(result);
}

/** Used to reap a channel after Telegram reports the user blocked the bot. */
export async function deleteChannelByPlatformUser(
  db: D1Database,
  platform: string,
  platformUserId: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM channels WHERE platform = ? AND platform_user_id = ?')
    .bind(platform, platformUserId)
    .run();
  return changed(result);
}

// ---------------------------------------------------------------------------
// link_tokens
// ---------------------------------------------------------------------------

export interface InsertLinkTokenInput {
  token: string;
  did: Did;
  platform: string;
  expiresAt: number;
}

export async function insertLinkToken(db: D1Database, input: InsertLinkTokenInput): Promise<void> {
  await db
    .prepare('INSERT INTO link_tokens (token, did, platform, expires_at) VALUES (?, ?, ?, ?)')
    .bind(input.token, input.did, input.platform, input.expiresAt)
    .run();
}

export function getLinkToken(db: D1Database, token: string): Promise<LinkTokenRow | null> {
  return db.prepare('SELECT * FROM link_tokens WHERE token = ?').bind(token).first<LinkTokenRow>();
}

export async function deleteLinkToken(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM link_tokens WHERE token = ?').bind(token).run();
}

export async function deleteExpiredLinkTokens(db: D1Database, nowMs: number): Promise<number> {
  const result = await db.prepare('DELETE FROM link_tokens WHERE expires_at < ?').bind(nowMs).run();
  return result.meta.changes ?? 0;
}

// ---------------------------------------------------------------------------
// senders
// ---------------------------------------------------------------------------

export function getSender(db: D1Database, did: Did): Promise<SenderRow | null> {
  return db.prepare('SELECT * FROM senders WHERE did = ?').bind(did).first<SenderRow>();
}

export function getSenderByHandle(db: D1Database, handle: string): Promise<SenderRow | null> {
  return db.prepare('SELECT * FROM senders WHERE handle = ?').bind(handle).first<SenderRow>();
}

export interface UpsertSenderInput {
  did: Did;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  profileFetchedAt: number;
}

export async function upsertSender(db: D1Database, input: UpsertSenderInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO senders (did, handle, display_name, avatar_url, profile_fetched_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(did) DO UPDATE SET
         handle = excluded.handle,
         display_name = excluded.display_name,
         avatar_url = excluded.avatar_url,
         profile_fetched_at = excluded.profile_fetched_at`,
    )
    .bind(input.did, input.handle, input.displayName, input.avatarUrl, input.profileFetchedAt)
    .run();
}

// ---------------------------------------------------------------------------
// pending_requests
// ---------------------------------------------------------------------------

export function getPendingByPair(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
): Promise<PendingRequestRow | null> {
  return db
    .prepare('SELECT * FROM pending_requests WHERE recipient_did = ? AND sender_did = ?')
    .bind(recipientDid, senderDid)
    .first<PendingRequestRow>();
}

export function getPendingById(db: D1Database, id: string): Promise<PendingRequestRow | null> {
  return db.prepare('SELECT * FROM pending_requests WHERE id = ?').bind(id).first<PendingRequestRow>();
}

export interface InsertPendingInput {
  id: string;
  recipientDid: Did;
  senderDid: Did;
  title: string;
  description: string | null;
  iconUrl: string | null;
  createdAt: number;
  expiresAt: number;
}

export async function insertPending(db: D1Database, input: InsertPendingInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO pending_requests
         (id, recipient_did, sender_did, title, description, icon_url, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.recipientDid,
      input.senderDid,
      input.title,
      input.description,
      input.iconUrl,
      input.createdAt,
      input.expiresAt,
    )
    .run();
}

export async function deletePendingById(db: D1Database, id: string, recipientDid: Did): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM pending_requests WHERE id = ? AND recipient_did = ?')
    .bind(id, recipientDid)
    .run();
  return changed(result);
}

export async function deletePendingByPair(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM pending_requests WHERE recipient_did = ? AND sender_did = ?')
    .bind(recipientDid, senderDid)
    .run();
  return changed(result);
}

export async function listPendingForRecipient(
  db: D1Database,
  recipientDid: Did,
  nowMs: number,
): Promise<PendingWithSenderRow[]> {
  const { results } = await db
    .prepare(
      `SELECT p.*, s.handle, s.display_name, s.avatar_url
       FROM pending_requests p
       LEFT JOIN senders s ON s.did = p.sender_did
       WHERE p.recipient_did = ? AND p.expires_at > ?
       ORDER BY p.created_at DESC`,
    )
    .bind(recipientDid, nowMs)
    .all<PendingWithSenderRow>();
  return results;
}

export async function deleteExpiredPending(db: D1Database, nowMs: number): Promise<number> {
  const result = await db
    .prepare('DELETE FROM pending_requests WHERE expires_at < ?')
    .bind(nowMs)
    .run();
  return result.meta.changes ?? 0;
}

// ---------------------------------------------------------------------------
// grants
// ---------------------------------------------------------------------------

export function getGrant(db: D1Database, recipientDid: Did, senderDid: Did): Promise<GrantRow | null> {
  return db
    .prepare('SELECT * FROM grants WHERE recipient_did = ? AND sender_did = ?')
    .bind(recipientDid, senderDid)
    .first<GrantRow>();
}

export interface UpsertGrantInput {
  recipientDid: Did;
  senderDid: Did;
  grantedAt: number;
  /** Display metadata copied from the pending request; null for manual grants. */
  title: string | null;
  description: string | null;
  iconUrl: string | null;
}

/**
 * Insert or refresh a grant. Re-granting resets `muted` to 0. Metadata is copied
 * from the pending request; `COALESCE` keeps any previously-stored metadata when
 * a re-grant provides none (e.g. a manual grant with no requestId).
 */
export async function upsertGrant(db: D1Database, input: UpsertGrantInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO grants (recipient_did, sender_did, granted_at, muted, title, description, icon_url)
       VALUES (?, ?, ?, 0, ?, ?, ?)
       ON CONFLICT(recipient_did, sender_did) DO UPDATE SET
         granted_at = excluded.granted_at,
         muted = 0,
         title = COALESCE(excluded.title, grants.title),
         description = COALESCE(excluded.description, grants.description),
         icon_url = COALESCE(excluded.icon_url, grants.icon_url)`,
    )
    .bind(
      input.recipientDid,
      input.senderDid,
      input.grantedAt,
      input.title,
      input.description,
      input.iconUrl,
    )
    .run();
}

export async function setGrantMuted(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
  muted: boolean,
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE grants SET muted = ? WHERE recipient_did = ? AND sender_did = ?')
    .bind(toInt(muted), recipientDid, senderDid)
    .run();
  return changed(result);
}

/** Set a grant's management capability ('none'|'self'|'full'). See MANAGEMENT-AUTH.md. */
export async function setGrantManage(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
  manage: 'none' | 'self' | 'full',
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE grants SET manage = ? WHERE recipient_did = ? AND sender_did = ?')
    .bind(manage, recipientDid, senderDid)
    .run();
  return changed(result);
}

export async function deleteGrant(db: D1Database, recipientDid: Did, senderDid: Did): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM grants WHERE recipient_did = ? AND sender_did = ?')
    .bind(recipientDid, senderDid)
    .run();
  return changed(result);
}

export async function listGrantsForRecipient(
  db: D1Database,
  recipientDid: Did,
): Promise<GrantWithSenderRow[]> {
  const { results } = await db
    .prepare(
      `SELECT g.*, s.handle, s.display_name, s.avatar_url
       FROM grants g
       LEFT JOIN senders s ON s.did = g.sender_did
       WHERE g.recipient_did = ?
       ORDER BY g.granted_at DESC`,
    )
    .bind(recipientDid)
    .all<GrantWithSenderRow>();
  return results;
}

// ---------------------------------------------------------------------------
// delivery_log
// ---------------------------------------------------------------------------

export interface InsertDeliveryLogInput {
  id: string;
  recipientDid: Did;
  senderDid: Did;
  title: string | null;
  deliveredCount: number;
  createdAt: number;
}

export async function insertDeliveryLog(db: D1Database, input: InsertDeliveryLogInput): Promise<void> {
  await db
    .prepare(
      'INSERT INTO delivery_log (id, recipient_did, sender_did, title, delivered_count, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(input.id, input.recipientDid, input.senderDid, input.title, input.deliveredCount, input.createdAt)
    .run();
}

export async function deleteOldDeliveryLog(db: D1Database, beforeMs: number): Promise<number> {
  const result = await db.prepare('DELETE FROM delivery_log WHERE created_at < ?').bind(beforeMs).run();
  return result.meta.changes ?? 0;
}

// ---------------------------------------------------------------------------
// push_subscriptions (web push)
// ---------------------------------------------------------------------------

export interface PushSubscriptionRow {
  endpoint: string;
  did: Did;
  p256dh: string;
  auth: string;
  label: string | null;
  created_at: number;
}

export interface UpsertPushSubscriptionInput {
  endpoint: string;
  did: Did;
  p256dh: string;
  auth: string;
  label: string | null;
  createdAt: number;
}

/**
 * Register a subscription, keyed by its endpoint. Re-subscribing refreshes the
 * keys/owner but preserves a previously-set (e.g. user-renamed) label.
 */
export async function upsertPushSubscription(
  db: D1Database,
  input: UpsertPushSubscriptionInput,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, did, p256dh, auth, label, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         did = excluded.did,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         label = COALESCE(push_subscriptions.label, excluded.label)`,
    )
    .bind(input.endpoint, input.did, input.p256dh, input.auth, input.label, input.createdAt)
    .run();
}

/** Rename a subscription owned by `did` (scoped). */
export async function renamePushSubscription(
  db: D1Database,
  did: Did,
  endpoint: string,
  label: string,
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE push_subscriptions SET label = ? WHERE did = ? AND endpoint = ?')
    .bind(label, did, endpoint)
    .run();
  return changed(result);
}

export async function listPushSubscriptionsForDid(
  db: D1Database,
  did: Did,
): Promise<PushSubscriptionRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM push_subscriptions WHERE did = ? ORDER BY created_at DESC')
    .bind(did)
    .all<PushSubscriptionRow>();
  return results;
}

export function countPushSubscriptionsForDid(db: D1Database, did: Did): Promise<{ c: number } | null> {
  return db
    .prepare('SELECT COUNT(*) AS c FROM push_subscriptions WHERE did = ?')
    .bind(did)
    .first<{ c: number }>();
}

/** Unregister a subscription owned by `did` (scoped so a user can't drop another's). */
export async function deletePushSubscriptionForDid(
  db: D1Database,
  did: Did,
  endpoint: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM push_subscriptions WHERE did = ? AND endpoint = ?')
    .bind(did, endpoint)
    .run();
  return changed(result);
}

/** Reap a dead subscription by endpoint (push service returned 404/410). */
export async function deletePushSubscription(db: D1Database, endpoint: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
    .bind(endpoint)
    .run();
  return changed(result);
}

// ---------------------------------------------------------------------------
// notifications (inbox)
// ---------------------------------------------------------------------------

export interface NotificationRow {
  id: string;
  recipient_did: Did;
  sender_did: Did;
  category: string | null;
  title: string;
  body: string;
  uri: string | null;
  actors: string | null; // JSON array
  created_at: number;
  read_at: number | null;
}

export interface InsertNotificationInput {
  id: string;
  recipientDid: Did;
  senderDid: Did;
  category: string | null;
  title: string;
  body: string;
  uri: string | null;
  actors: string[] | null;
  createdAt: number;
}

export async function insertNotification(db: D1Database, input: InsertNotificationInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notifications
         (id, recipient_did, sender_did, category, title, body, uri, actors, created_at, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      input.id,
      input.recipientDid,
      input.senderDid,
      input.category,
      input.title,
      input.body,
      input.uri,
      input.actors ? JSON.stringify(input.actors) : null,
      input.createdAt,
    )
    .run();
}

/** Page the inbox newest-first; `before` is a `created_at` cursor (exclusive). */
export async function listNotificationsForRecipient(
  db: D1Database,
  recipientDid: Did,
  limit: number,
  before?: number,
): Promise<NotificationRow[]> {
  const sql =
    before !== undefined
      ? 'SELECT * FROM notifications WHERE recipient_did = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM notifications WHERE recipient_did = ? ORDER BY created_at DESC LIMIT ?';
  const stmt =
    before !== undefined
      ? db.prepare(sql).bind(recipientDid, before, limit)
      : db.prepare(sql).bind(recipientDid, limit);
  const { results } = await stmt.all<NotificationRow>();
  return results;
}

export function countUnreadNotifications(db: D1Database, recipientDid: Did): Promise<{ c: number } | null> {
  return db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE recipient_did = ? AND read_at IS NULL')
    .bind(recipientDid)
    .first<{ c: number }>();
}

export async function markNotificationsRead(
  db: D1Database,
  recipientDid: Did,
  ids: string[],
  readAt: number,
): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const result = await db
    .prepare(
      `UPDATE notifications SET read_at = ?
       WHERE recipient_did = ? AND read_at IS NULL AND id IN (${placeholders})`,
    )
    .bind(readAt, recipientDid, ...ids)
    .run();
  return result.meta.changes ?? 0;
}

export async function markAllNotificationsRead(
  db: D1Database,
  recipientDid: Did,
  readAt: number,
): Promise<number> {
  const result = await db
    .prepare('UPDATE notifications SET read_at = ? WHERE recipient_did = ? AND read_at IS NULL')
    .bind(readAt, recipientDid)
    .run();
  return result.meta.changes ?? 0;
}

// --- App-scoped inbox access (one sender's notifications for one recipient) ---
// Used by the federated, dual-authed `listNotifications`/`markRead` so an app
// can see and acknowledge only the notifications *it* sent.

export interface NotificationWithDeliveryRow extends NotificationRow {
  /** Channels this notification fanned out to (from delivery_log); null if unlogged. */
  delivered_count: number | null;
}

/** Page one sender's notifications to one recipient, newest-first, with delivery counts. */
export async function listNotificationsFromSender(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
  limit: number,
  before?: number,
): Promise<NotificationWithDeliveryRow[]> {
  const where =
    before !== undefined
      ? 'n.recipient_did = ? AND n.sender_did = ? AND n.created_at < ?'
      : 'n.recipient_did = ? AND n.sender_did = ?';
  const sql = `SELECT n.*, d.delivered_count FROM notifications n
       LEFT JOIN delivery_log d ON d.id = n.id
       WHERE ${where} ORDER BY n.created_at DESC LIMIT ?`;
  const stmt =
    before !== undefined
      ? db.prepare(sql).bind(recipientDid, senderDid, before, limit)
      : db.prepare(sql).bind(recipientDid, senderDid, limit);
  const { results } = await stmt.all<NotificationWithDeliveryRow>();
  return results;
}

/**
 * Mark a sender's notifications to a recipient as read. With `ids`, only those
 * (still scoped to this sender); without, all of this sender's unread ones.
 * Returns the number of rows changed.
 */
export async function markNotificationsReadFromSender(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
  readAt: number,
  ids?: string[],
): Promise<number> {
  if (ids !== undefined) {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const result = await db
      .prepare(
        `UPDATE notifications SET read_at = ?
         WHERE recipient_did = ? AND sender_did = ? AND read_at IS NULL AND id IN (${placeholders})`,
      )
      .bind(readAt, recipientDid, senderDid, ...ids)
      .run();
    return result.meta.changes ?? 0;
  }
  const result = await db
    .prepare(
      'UPDATE notifications SET read_at = ? WHERE recipient_did = ? AND sender_did = ? AND read_at IS NULL',
    )
    .bind(readAt, recipientDid, senderDid)
    .run();
  return result.meta.changes ?? 0;
}

// ---------------------------------------------------------------------------
// app_categories + routing (per-category routing)
// ---------------------------------------------------------------------------

export interface AppCategoryRow {
  recipient_did: Did;
  sender_did: Did;
  category: string;
  description: string | null;
  last_seen: number;
}

export interface UpsertAppCategoryInput {
  recipientDid: Did;
  senderDid: Did;
  category: string;
  description: string | null;
  lastSeen: number;
}

/** Record a category seen from a sender (keeps the latest description). */
export async function upsertAppCategory(db: D1Database, input: UpsertAppCategoryInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_categories (recipient_did, sender_did, category, description, last_seen)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(recipient_did, sender_did, category) DO UPDATE SET
         description = COALESCE(excluded.description, app_categories.description),
         last_seen = excluded.last_seen`,
    )
    .bind(input.recipientDid, input.senderDid, input.category, input.description, input.lastSeen)
    .run();
}

export async function listAppCategoriesForRecipient(
  db: D1Database,
  recipientDid: Did,
): Promise<AppCategoryRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM app_categories WHERE recipient_did = ? ORDER BY category ASC')
    .bind(recipientDid)
    .all<AppCategoryRow>();
  return results;
}

/** Categories seen from one sender for one recipient (for an app's own routing UI). */
export async function listAppCategoriesForSender(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
): Promise<AppCategoryRow[]> {
  const { results } = await db
    .prepare(
      'SELECT * FROM app_categories WHERE recipient_did = ? AND sender_did = ? ORDER BY category ASC',
    )
    .bind(recipientDid, senderDid)
    .all<AppCategoryRow>();
  return results;
}

export interface RoutingRow {
  recipient_did: Did;
  sender_did: Did;
  category: string;
  route: string;
}

export function getRoutingRoute(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
  category: string,
): Promise<RoutingRow | null> {
  return db
    .prepare('SELECT * FROM routing WHERE recipient_did = ? AND sender_did = ? AND category = ?')
    .bind(recipientDid, senderDid, category)
    .first<RoutingRow>();
}

export async function listRoutingForRecipient(
  db: D1Database,
  recipientDid: Did,
): Promise<RoutingRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM routing WHERE recipient_did = ?')
    .bind(recipientDid)
    .all<RoutingRow>();
  return results;
}

/** Per-category routing overrides from one sender for one recipient. */
export async function listRoutingForSender(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
): Promise<RoutingRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM routing WHERE recipient_did = ? AND sender_did = ?')
    .bind(recipientDid, senderDid)
    .all<RoutingRow>();
  return results;
}

export async function upsertRouting(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
  category: string,
  route: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO routing (recipient_did, sender_did, category, route)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(recipient_did, sender_did, category) DO UPDATE SET route = excluded.route`,
    )
    .bind(recipientDid, senderDid, category, route)
    .run();
}

export async function deleteRouting(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
  category: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM routing WHERE recipient_did = ? AND sender_did = ? AND category = ?')
    .bind(recipientDid, senderDid, category)
    .run();
}

export async function setDefaultRoute(db: D1Database, did: Did, route: string): Promise<void> {
  await db.prepare('UPDATE users SET default_route = ? WHERE did = ?').bind(route, did).run();
}

export async function setAutoAllow(db: D1Database, did: Did, value: string): Promise<void> {
  await db.prepare('UPDATE users SET auto_allow = ? WHERE did = ?').bind(value, did).run();
}

// App-wide routing: one optional row per (recipient, sender). Absence = inherit
// the user default; a category with no routing row inherits this.

export interface AppRoutingRow {
  recipient_did: Did;
  sender_did: Did;
  route: string;
}

export function getAppRoute(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
): Promise<AppRoutingRow | null> {
  return db
    .prepare('SELECT * FROM app_routing WHERE recipient_did = ? AND sender_did = ?')
    .bind(recipientDid, senderDid)
    .first<AppRoutingRow>();
}

export async function listAppRoutingForRecipient(
  db: D1Database,
  recipientDid: Did,
): Promise<AppRoutingRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM app_routing WHERE recipient_did = ?')
    .bind(recipientDid)
    .all<AppRoutingRow>();
  return results;
}

export async function upsertAppRoute(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
  route: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_routing (recipient_did, sender_did, route)
       VALUES (?, ?, ?)
       ON CONFLICT(recipient_did, sender_did) DO UPDATE SET route = excluded.route`,
    )
    .bind(recipientDid, senderDid, route)
    .run();
}

export async function deleteAppRoute(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
): Promise<void> {
  await db
    .prepare('DELETE FROM app_routing WHERE recipient_did = ? AND sender_did = ?')
    .bind(recipientDid, senderDid)
    .run();
}
