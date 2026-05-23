import { INBOX_MAX_ROWS } from '../config';
import { getDb } from './schema';

export interface NotificationRow {
  id: string;
  sender_did: string;
  sender_handle: string | null;
  sender_display_name: string | null;
  sender_avatar: string | null;
  title: string;
  body: string;
  uri: string | null;
  created_at: number; // unix ms
  read_at: number | null;
}

export interface NotificationInput {
  id: string;
  senderDid: string;
  senderHandle?: string | null;
  senderDisplayName?: string | null;
  senderAvatar?: string | null;
  title: string;
  body: string;
  uri?: string | null;
  createdAt: number;
}

/** Insert a notification, keeping any existing read state (id is immutable). */
export async function insertNotification(input: NotificationInput): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO notifications
       (id, sender_did, sender_handle, sender_display_name, sender_avatar, title, body, uri, created_at, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    input.id,
    input.senderDid,
    input.senderHandle ?? null,
    input.senderDisplayName ?? null,
    input.senderAvatar ?? null,
    input.title,
    input.body,
    input.uri ?? null,
    input.createdAt,
  );
}

export async function getRecent(limit = 100): Promise<NotificationRow[]> {
  const db = await getDb();
  return db.getAllAsync<NotificationRow>(
    'SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?',
    limit,
  );
}

export async function getBySender(senderDid: string, limit = 100): Promise<NotificationRow[]> {
  const db = await getDb();
  return db.getAllAsync<NotificationRow>(
    'SELECT * FROM notifications WHERE sender_did = ? ORDER BY created_at DESC LIMIT ?',
    senderDid,
    limit,
  );
}

export async function getById(id: string): Promise<NotificationRow | null> {
  const db = await getDb();
  return db.getFirstAsync<NotificationRow>('SELECT * FROM notifications WHERE id = ?', id);
}

export async function markRead(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL', Date.now(), id);
}

export async function deleteNotification(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM notifications WHERE id = ?', id);
}

export async function getCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM notifications');
  return row?.n ?? 0;
}

export async function getUnreadCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL',
  );
  return row?.n ?? 0;
}

/** Most recent locally-stored timestamp (the sync floor). */
export async function getNewestCreatedAt(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ max: number | null }>(
    'SELECT MAX(created_at) AS max FROM notifications',
  );
  return row?.max ?? 0;
}

export async function markAllRead(): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE notifications SET read_at = ? WHERE read_at IS NULL', Date.now());
}

/** Prune the oldest rows beyond the cap. */
export async function pruneOld(max = INBOX_MAX_ROWS): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM notifications WHERE id IN (
       SELECT id FROM notifications ORDER BY created_at DESC LIMIT -1 OFFSET ?
     )`,
    max,
  );
}
