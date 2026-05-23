-- Inbox (Phase 3). Every accepted `send` is recorded here as the canonical
-- history; per-category routing (Phase 4) only decides which alert channels also
-- fire. `read_at` null = unread. `actors` is a JSON array of handles/DIDs.

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  category TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  uri TEXT,
  actors TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX notifications_by_recipient ON notifications (recipient_did, created_at DESC);
