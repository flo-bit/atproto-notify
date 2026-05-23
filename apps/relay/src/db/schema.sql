-- Canonical schema reference for the relay's D1 database.
--
-- This file is documentation: the source of truth applied to D1 is the numbered
-- migrations in `apps/relay/migrations/`. Keep this in sync with them (currently
-- it mirrors migrations/0001_init.sql).
--
-- All timestamps are unix milliseconds (Date.now()).

CREATE TABLE users (
  did TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  notify_pending_via_telegram INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE channels (
  did TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  display_name TEXT,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (did, platform)
);
CREATE UNIQUE INDEX channels_by_platform_user ON channels (platform, platform_user_id);

CREATE TABLE link_tokens (
  token TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  platform TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX link_tokens_by_did ON link_tokens (did);
CREATE INDEX link_tokens_by_expires ON link_tokens (expires_at);

CREATE TABLE senders (
  did TEXT PRIMARY KEY,
  handle TEXT,
  display_name TEXT,
  avatar_url TEXT,
  profile_fetched_at INTEGER
);

CREATE TABLE pending_requests (
  id TEXT PRIMARY KEY,
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE (recipient_did, sender_did)
);
CREATE INDEX pending_by_recipient ON pending_requests (recipient_did);
CREATE INDEX pending_by_expires ON pending_requests (expires_at);

CREATE TABLE grants (
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  muted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (recipient_did, sender_did)
);
CREATE INDEX grants_by_recipient ON grants (recipient_did);

CREATE TABLE delivery_log (
  id TEXT PRIMARY KEY,
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  title TEXT,
  delivered_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX delivery_by_recipient ON delivery_log (recipient_did, created_at DESC);
