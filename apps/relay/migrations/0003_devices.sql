-- Migration 0003: per-device channels + richer delivery log (mobile support).
--
-- `channels` grows a `device_id` column and its primary key becomes
-- (did, platform, device_id) so one DID can have many devices on one platform
-- (e.g. an iPhone and an iPad). D1/SQLite can't alter a primary key in place, so
-- we use the create-copy-drop-rename pattern. Existing Telegram rows get
-- device_id = platform_user_id (the chat id), which is already unique per row.
--
-- `delivery_log` grows `body` and `uri` so the mobile inbox can render full
-- notification content and offer "Open original".

CREATE TABLE channels_new (
  device_id TEXT NOT NULL,
  did TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  display_name TEXT,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (did, platform, device_id)
);

INSERT INTO channels_new (device_id, did, platform, platform_user_id, display_name, linked_at)
  SELECT platform_user_id, did, platform, platform_user_id, display_name, linked_at FROM channels;

DROP TABLE channels;
ALTER TABLE channels_new RENAME TO channels;

-- One platform_user_id (telegram chat id / push token) maps to exactly one row.
-- When a push token rotates, the dispatcher prunes the stale row and the next
-- registerDevice inserts a fresh one.
CREATE UNIQUE INDEX channels_by_platform_user ON channels (platform, platform_user_id);
CREATE INDEX channels_by_did ON channels (did);

ALTER TABLE delivery_log ADD COLUMN body TEXT;
ALTER TABLE delivery_log ADD COLUMN uri TEXT;

-- Supports listNotifications' optional per-sender filter.
CREATE INDEX delivery_by_recipient_sender ON delivery_log (recipient_did, sender_did, created_at DESC);
