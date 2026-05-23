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
  reason: string | null;
  created_at: number;
  expires_at: number;
}

export interface GrantRow {
  recipient_did: Did;
  sender_did: Did;
  granted_at: number;
  muted: number;
}

/** A grant joined with the (optional) cached sender profile. */
export interface GrantWithSenderRow extends GrantRow {
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

/** A pending request joined with the (optional) cached sender profile. */
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
  reason: string | null;
  createdAt: number;
  expiresAt: number;
}

export async function insertPending(db: D1Database, input: InsertPendingInput): Promise<void> {
  await db
    .prepare(
      'INSERT INTO pending_requests (id, recipient_did, sender_did, reason, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(input.id, input.recipientDid, input.senderDid, input.reason, input.createdAt, input.expiresAt)
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

/** Insert or refresh a grant. Re-granting resets `muted` to 0. */
export async function upsertGrant(
  db: D1Database,
  recipientDid: Did,
  senderDid: Did,
  grantedAt: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO grants (recipient_did, sender_did, granted_at, muted)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(recipient_did, sender_did) DO UPDATE SET
         granted_at = excluded.granted_at,
         muted = 0`,
    )
    .bind(recipientDid, senderDid, grantedAt)
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
