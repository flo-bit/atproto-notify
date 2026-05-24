import type { Did } from '@atcute/lexicons';

// Row shapes mirror migrations/0001_init.sql. D1 returns plain JSON; we treat
// the `.first()/.all()` boundary as the place to assert these types (DID columns
// are branded `Did`). Booleans are stored as 0/1 integers.

export interface UserRow {
  did: Did;
  created_at: number;
  default_route: string;
  auto_allow: string;
  /** Where permission-request alerts go: a concrete route (token set) or 'off'. */
  pending_route: string;
}

export interface LinkTokenRow {
  token: string;
  did: Did;
  platform: string;
  /** Optional user-chosen name carried through the linking round-trip. */
  label: string | null;
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

/**
 * Insert a users row if absent. No-op when it already exists. `default_route` is
 * set explicitly to 'inbox' (rather than leaning on the column default) so new
 * accounts start at inbox-only even on a DB whose column default predates that.
 */
export async function ensureUser(db: D1Database, did: Did, createdAt: number): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO users (did, created_at, default_route) VALUES (?, ?, 'inbox')")
    .bind(did, createdAt)
    .run();
}

/** Set where permission-request alerts go (a concrete route, or 'off'). */
export async function setPendingRoute(db: D1Database, did: Did, route: string): Promise<void> {
  await db.prepare('UPDATE users SET pending_route = ? WHERE did = ?').bind(route, did).run();
}

// ---------------------------------------------------------------------------
// delivery_targets (unified push / telegram / email)
// ---------------------------------------------------------------------------
//
// One table for every delivery destination, discriminated by `channel`. `ref` is
// the channel's natural dedup key (push endpoint / telegram chat id / email
// address); `id` is the stable token a route uses to target one instance. See
// migrations/0001_init.sql.

export type DeliveryChannelKind = 'push' | 'telegram' | 'email' | 'dm' | 'webhook';

export interface DeliveryTargetRow {
  id: string;
  did: Did;
  channel: string;
  ref: string;
  label: string | null;
  /** 1 once the user renamed it (so the auto label isn't exposed to apps). */
  named: number;
  verified: number;
  config: string; // channel-specific JSON
  created_at: number;
}

/** A delivery target with its `config` JSON parsed into channel-specific fields. */
export type DeliveryInstance =
  | { id: string; channel: 'push'; label: string; verified: boolean; endpoint: string; p256dh: string; auth: string }
  | { id: string; channel: 'telegram'; label: string; verified: boolean; chatId: string }
  | { id: string; channel: 'email'; label: string; verified: boolean; address: string }
  | { id: string; channel: 'dm'; label: string; verified: boolean; recipientDid: string }
  | { id: string; channel: 'webhook'; label: string; verified: boolean; url: string };

const DEFAULT_LABEL: Record<DeliveryChannelKind, string> = {
  push: 'Unknown device',
  telegram: 'Telegram',
  email: 'Email',
  dm: 'Bluesky DM',
  webhook: 'Webhook',
};

/** Parse a row into a typed instance, or null for an unknown channel. */
export function toDeliveryInstance(row: DeliveryTargetRow): DeliveryInstance | null {
  const verified = row.verified === 1;
  if (row.channel === 'push') {
    const cfg = JSON.parse(row.config || '{}') as { p256dh?: string; auth?: string };
    return {
      id: row.id,
      channel: 'push',
      label: row.label ?? DEFAULT_LABEL.push,
      verified,
      endpoint: row.ref,
      p256dh: cfg.p256dh ?? '',
      auth: cfg.auth ?? '',
    };
  }
  if (row.channel === 'telegram') {
    return { id: row.id, channel: 'telegram', label: row.label ?? DEFAULT_LABEL.telegram, verified, chatId: row.ref };
  }
  if (row.channel === 'email') {
    return { id: row.id, channel: 'email', label: row.label ?? row.ref, verified, address: row.ref };
  }
  if (row.channel === 'dm') {
    // ref = the recipient's own DID (DM to self); always verified on enable.
    return { id: row.id, channel: 'dm', label: row.label ?? DEFAULT_LABEL.dm, verified, recipientDid: row.ref };
  }
  if (row.channel === 'webhook') {
    // The destination URL lives in config (ref is a per-user dedup key, not the URL).
    const cfg = JSON.parse(row.config || '{}') as { url?: string };
    return { id: row.id, channel: 'webhook', label: row.label ?? DEFAULT_LABEL.webhook, verified, url: cfg.url ?? '' };
  }
  return null;
}

export interface UpsertDeliveryTargetInput {
  id: string;
  did: Did;
  channel: DeliveryChannelKind;
  ref: string;
  label: string | null;
  /** 1 when `label` is a user-chosen name (exposed to apps); 0 for an auto label. */
  named?: boolean;
  verified: boolean;
  config: Record<string, unknown>;
  createdAt: number;
}

/**
 * Insert a target, deduped on the globally-unique (channel, ref). Re-linking the
 * same ref — a push re-subscribe, or a Telegram account moving between accounts —
 * updates the owner, keys and verified flag but KEEPS the original id, label and
 * `named` flag, so routes pinned to that instance survive and a user-renamed
 * device keeps its name. (Email enforces a single address per user in ops, not here.)
 */
export async function upsertDeliveryTarget(
  db: D1Database,
  input: UpsertDeliveryTargetInput,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO delivery_targets (id, did, channel, ref, label, named, verified, config, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(channel, ref) DO UPDATE SET
         did = excluded.did,
         label = COALESCE(delivery_targets.label, excluded.label),
         verified = excluded.verified,
         config = excluded.config`,
    )
    .bind(
      input.id,
      input.did,
      input.channel,
      input.ref,
      input.label,
      input.named ? 1 : 0,
      input.verified ? 1 : 0,
      JSON.stringify(input.config),
      input.createdAt,
    )
    .run();
}

/** All of a user's delivery targets, newest first. */
export async function listDeliveryTargets(db: D1Database, did: Did): Promise<DeliveryTargetRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM delivery_targets WHERE did = ? ORDER BY created_at DESC')
    .bind(did)
    .all<DeliveryTargetRow>();
  return results;
}

/** A target by its globally-unique (channel, ref) — resolves a Telegram chat to its owner. */
export function getDeliveryTargetByRef(
  db: D1Database,
  channel: DeliveryChannelKind,
  ref: string,
): Promise<DeliveryTargetRow | null> {
  return db
    .prepare('SELECT * FROM delivery_targets WHERE channel = ? AND ref = ?')
    .bind(channel, ref)
    .first<DeliveryTargetRow>();
}

export function countDeliveryTargets(
  db: D1Database,
  did: Did,
  channel: DeliveryChannelKind,
): Promise<{ c: number } | null> {
  return db
    .prepare('SELECT COUNT(*) AS c FROM delivery_targets WHERE did = ? AND channel = ?')
    .bind(did, channel)
    .first<{ c: number }>();
}

/** Rename a target owned by `did`, addressed by its stable id (any channel). */
export async function renameDeliveryTargetById(
  db: D1Database,
  did: Did,
  id: string,
  label: string,
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE delivery_targets SET label = ?, named = 1 WHERE did = ? AND id = ?')
    .bind(label, did, id)
    .run();
  return changed(result);
}

/** Remove a target owned by `did` by its stable id (any channel). */
export async function deleteDeliveryTargetById(
  db: D1Database,
  did: Did,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM delivery_targets WHERE did = ? AND id = ?')
    .bind(did, id)
    .run();
  return changed(result);
}

/** Delete a target owned by `did` by (channel, ref) — the push "disable this
 *  browser" path, which knows the endpoint but not the id. */
export async function deleteDeliveryTarget(
  db: D1Database,
  did: Did,
  channel: DeliveryChannelKind,
  ref: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM delivery_targets WHERE did = ? AND channel = ? AND ref = ?')
    .bind(did, channel, ref)
    .run();
  return changed(result);
}

/** Reap a dead target by (channel, ref), any owner (push 404/410, Telegram block). */
export async function deleteDeliveryTargetByRef(
  db: D1Database,
  channel: DeliveryChannelKind,
  ref: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM delivery_targets WHERE channel = ? AND ref = ?')
    .bind(channel, ref)
    .run();
  return changed(result);
}

/** Mark the user's pending email verified iff the code matches and is unexpired. */
export async function verifyEmailTarget(
  db: D1Database,
  did: Did,
  code: string,
  nowMs: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE delivery_targets SET verified = 1, config = '{}'
       WHERE did = ? AND channel = 'email' AND verified = 0
         AND json_extract(config, '$.code') = ?
         AND json_extract(config, '$.expires') > ?`,
    )
    .bind(did, code, nowMs)
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
  /** Optional user-chosen name, applied to the target on link completion. */
  label?: string | null;
  expiresAt: number;
}

export async function insertLinkToken(db: D1Database, input: InsertLinkTokenInput): Promise<void> {
  await db
    .prepare('INSERT INTO link_tokens (token, did, platform, label, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(input.token, input.did, input.platform, input.label ?? null, input.expiresAt)
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
 * Insert or refresh a grant. New grants default to `manage = 'self'` (an app may
 * manage its own routing/inbox) — set explicitly here rather than relying on the
 * column default, so the behaviour is consistent even on a DB whose `grants`
 * table predates that default. Re-granting resets `muted` to 0 but KEEPS the
 * user's chosen `manage` capability. Metadata is copied from the pending request;
 * `COALESCE` keeps previously-stored metadata when a re-grant provides none.
 */
export async function upsertGrant(db: D1Database, input: UpsertGrantInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO grants (recipient_did, sender_did, granted_at, muted, title, description, icon_url, manage)
       VALUES (?, ?, ?, 0, ?, ?, ?, 'self')
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

/** Permanently delete all of one sender's notifications to a recipient. Returns the count. */
export async function deleteNotificationsFromSender(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
): Promise<number> {
  const result = await db
    .prepare('DELETE FROM notifications WHERE recipient_did = ? AND sender_did = ?')
    .bind(recipientDid, senderDid)
    .run();
  return result.meta.changes ?? 0;
}

/** Retention backstop: drop inbox entries older than `beforeMs` (read or not). */
export async function deleteOldNotifications(db: D1Database, beforeMs: number): Promise<number> {
  const result = await db
    .prepare('DELETE FROM notifications WHERE created_at < ?')
    .bind(beforeMs)
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
  title: string | null;
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

/** Record a category seen from a sender (keeps the latest description + any title). */
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

export interface DeclareAppCategoryInput {
  recipientDid: Did;
  senderDid: Did;
  category: string;
  title: string | null;
  description: string | null;
  lastSeen: number;
}

/** App-declared category (setCategories/addCategory): upsert key + title +
 *  description. Null title/description preserve any existing value. */
export async function declareAppCategory(
  db: D1Database,
  input: DeclareAppCategoryInput,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_categories (recipient_did, sender_did, category, title, description, last_seen)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(recipient_did, sender_did, category) DO UPDATE SET
         title = COALESCE(excluded.title, app_categories.title),
         description = COALESCE(excluded.description, app_categories.description),
         last_seen = excluded.last_seen`,
    )
    .bind(
      input.recipientDid,
      input.senderDid,
      input.category,
      input.title,
      input.description,
      input.lastSeen,
    )
    .run();
}

/** Remove one app-declared category (its routing row is cleaned up separately). */
export async function deleteAppCategory(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
  category: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM app_categories WHERE recipient_did = ? AND sender_did = ? AND category = ?')
    .bind(recipientDid, senderDid, category)
    .run();
  return changed(result);
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

/**
 * Cascade for `revoke`: drop everything scoped to one (recipient, sender) app —
 * its app-wide route, per-category routes, and declared/seen categories — so a
 * revoked app leaves no stale routing/category rows (and a re-grant starts clean).
 * Inbox notifications are intentionally kept (historical).
 */
export async function deleteSenderRoutingData(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
): Promise<void> {
  await db.batch([
    db
      .prepare('DELETE FROM app_routing WHERE recipient_did = ? AND sender_did = ?')
      .bind(recipientDid, senderDid),
    db
      .prepare('DELETE FROM routing WHERE recipient_did = ? AND sender_did = ?')
      .bind(recipientDid, senderDid),
    db
      .prepare('DELETE FROM app_categories WHERE recipient_did = ? AND sender_did = ?')
      .bind(recipientDid, senderDid),
  ]);
}
