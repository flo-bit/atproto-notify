import * as SQLite from 'expo-sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  sender_did TEXT NOT NULL,
  sender_handle TEXT,
  sender_display_name TEXT,
  sender_avatar TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  uri TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS notifications_by_created ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_by_sender ON notifications (sender_did, created_at DESC);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Open (once) the local inbox database and ensure the schema exists. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('notifs.db');
    await db.execAsync(SCHEMA);
    return db;
  })();
  return dbPromise;
}
