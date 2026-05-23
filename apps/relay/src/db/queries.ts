import type { Did } from '@atcute/lexicons';

// Row shapes mirror migrations/0001_init.sql. D1 returns plain JSON; we treat
// the `.first()/.all()` boundary as the place to assert these types (DID columns
// are branded `Did`). Booleans are stored as 0/1 integers.

export interface UserRow {
  did: Did;
  created_at: number;
  notify_pending_via_telegram: number;
}

export interface ChannelRow {
  device_id: string;
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
  deviceId: string;
  did: Did;
  platform: string;
  platformUserId: string;
  displayName: string | null;
  linkedAt: number;
}

/**
 * Insert/replace a channel. `INSERT OR REPLACE` also clears any existing row
 * that collides on the `(platform, platform_user_id)` unique index, so linking
 * a Telegram account (or a push token) previously tied to another DID moves it
 * cleanly.
 */
export async function upsertChannel(db: D1Database, input: UpsertChannelInput): Promise<void> {
  await db
    .prepare(
      'INSERT OR REPLACE INTO channels (device_id, did, platform, platform_user_id, display_name, linked_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(
      input.deviceId,
      input.did,
      input.platform,
      input.platformUserId,
      input.displayName,
      input.linkedAt,
    )
    .run();
}

/** Refresh an existing device's `linked_at` (and `display_name` if provided). */
export async function touchChannel(
  db: D1Database,
  input: { did: Did; deviceId: string; displayName: string | null; linkedAt: number },
): Promise<void> {
  await db
    .prepare(
      'UPDATE channels SET linked_at = ?, display_name = COALESCE(?, display_name) WHERE did = ? AND device_id = ?',
    )
    .bind(input.linkedAt, input.displayName, input.did, input.deviceId)
    .run();
}

/** Unlink a single device, scoped to its owner (no cross-user deletes). */
export async function deleteChannelByDevice(
  db: D1Database,
  did: Did,
  deviceId: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM channels WHERE did = ? AND device_id = ?')
    .bind(did, deviceId)
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
  body: string | null;
  uri: string | null;
  deliveredCount: number;
  createdAt: number;
}

export async function insertDeliveryLog(db: D1Database, input: InsertDeliveryLogInput): Promise<void> {
  await db
    .prepare(
      'INSERT INTO delivery_log (id, recipient_did, sender_did, title, body, uri, delivered_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      input.id,
      input.recipientDid,
      input.senderDid,
      input.title,
      input.body,
      input.uri,
      input.deliveredCount,
      input.createdAt,
    )
    .run();
}

/** A delivery_log row joined with the (optional) cached sender profile. */
export interface DeliveryWithSenderRow {
  id: string;
  sender_did: Did;
  title: string | null;
  body: string | null;
  uri: string | null;
  created_at: number;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ListNotificationsInput {
  recipientDid: Did;
  limit: number;
  /** Keyset cursor: rows strictly older than (createdAt, id). */
  cursor?: { createdAt: number; id: string };
  senderDid?: Did;
}

/**
 * Page the recipient's delivery history newest-first, joined to cached sender
 * profiles. Keyset pagination on (created_at, id) so it's stable under inserts.
 */
export async function listNotificationsForRecipient(
  db: D1Database,
  input: ListNotificationsInput,
): Promise<DeliveryWithSenderRow[]> {
  const clauses = ['d.recipient_did = ?'];
  const binds: unknown[] = [input.recipientDid];
  if (input.senderDid !== undefined) {
    clauses.push('d.sender_did = ?');
    binds.push(input.senderDid);
  }
  if (input.cursor !== undefined) {
    clauses.push('(d.created_at < ? OR (d.created_at = ? AND d.id < ?))');
    binds.push(input.cursor.createdAt, input.cursor.createdAt, input.cursor.id);
  }
  binds.push(input.limit);
  const { results } = await db
    .prepare(
      `SELECT d.id, d.sender_did, d.title, d.body, d.uri, d.created_at,
              s.handle, s.display_name, s.avatar_url
       FROM delivery_log d
       LEFT JOIN senders s ON s.did = d.sender_did
       WHERE ${clauses.join(' AND ')}
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT ?`,
    )
    .bind(...binds)
    .all<DeliveryWithSenderRow>();
  return results;
}

export async function deleteOldDeliveryLog(db: D1Database, beforeMs: number): Promise<number> {
  const result = await db.prepare('DELETE FROM delivery_log WHERE created_at < ?').bind(beforeMs).run();
  return result.meta.changes ?? 0;
}
