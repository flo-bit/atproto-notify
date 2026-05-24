-- Canonical schema for the atproto notification relay.
-- All timestamps are unix milliseconds (Date.now()); booleans are 0/1 integers.

CREATE TABLE users (
  did TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  -- Account-default alert route: a '+'-joined token set (see lexicons/rpc.ts).
  -- New accounts start at 'inbox' (recorded, no alerts) — it always "works" even
  -- before any delivery channel is connected; the web app nudges the user to pick
  -- a real route once they add their first channel.
  default_route TEXT NOT NULL DEFAULT 'inbox',
  -- Incoming-request policy: 'all' | 'trusted' (TRUSTED_SENDERS) | 'none'.
  auto_allow TEXT NOT NULL DEFAULT 'trusted',
  -- Where permission-request alerts go: a concrete route (token set) or 'off'.
  pending_route TEXT NOT NULL DEFAULT 'off'
);

-- Unified delivery targets. Every place a notification can be delivered — a web
-- push device, a Telegram chat, or a verified email — is one row, discriminated
-- by `channel` ('push' | 'telegram' | 'email').
--   * `ref`      the channel's natural dedup key (push endpoint / chat id / email
--                address). Globally unique per channel.
--   * `id`       a stable, opaque token a route references to target this one
--                instance (e.g. one of several push devices). Survives re-link.
--   * `label`    display name (device name / Telegram username / email address).
--   * `named`    1 once the user renames it — so the auto label (which for email/
--                telegram is PII) is never exposed to apps unless user-chosen.
--   * `verified` gates delivery: email starts 0 until a code is confirmed;
--                push/telegram are created already verified (1).
--   * `config`   channel-specific JSON: push {p256dh, auth}; email {code, expires}
--                while unverified (cleared once verified); telegram {}.
CREATE TABLE delivery_targets (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  channel TEXT NOT NULL,
  ref TEXT NOT NULL,
  label TEXT,
  named INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE (channel, ref)
);
CREATE INDEX delivery_targets_by_did ON delivery_targets (did);

-- Short-lived tokens for the Telegram linking handshake (deep-link → /start).
-- `label` is an optional user-chosen name carried from the web form through the
-- round-trip, applied to the delivery target on completion (named = 1).
CREATE TABLE link_tokens (
  token TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  platform TEXT NOT NULL,
  label TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX link_tokens_by_did ON link_tokens (did);
CREATE INDEX link_tokens_by_expires ON link_tokens (expires_at);

-- Cached Bluesky profiles for senders (best-effort display metadata).
CREATE TABLE senders (
  did TEXT PRIMARY KEY,
  handle TEXT,
  display_name TEXT,
  avatar_url TEXT,
  profile_fetched_at INTEGER
);

-- A sender's request to notify a recipient, awaiting approval. The requester
-- supplies user-facing display metadata (title/description/icon), copied onto the
-- grant on approval.
CREATE TABLE pending_requests (
  id TEXT PRIMARY KEY,
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  title TEXT,
  description TEXT,
  icon_url TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE (recipient_did, sender_did)
);
CREATE INDEX pending_by_recipient ON pending_requests (recipient_did);
CREATE INDEX pending_by_expires ON pending_requests (expires_at);

-- An approved (recipient, sender) pair. `manage` is the management capability the
-- user designates for the app: 'none' | 'self' | 'full' (see MANAGEMENT-AUTH.md).
-- New grants default to 'self' (an app may manage its own routing/inbox); the user
-- can downgrade to 'none' or upgrade to 'full' per app.
CREATE TABLE grants (
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  muted INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  description TEXT,
  icon_url TEXT,
  manage TEXT NOT NULL DEFAULT 'self',
  PRIMARY KEY (recipient_did, sender_did)
);
CREATE INDEX grants_by_recipient ON grants (recipient_did);

-- One row per accepted `send`: how many alert channels it fanned out to.
CREATE TABLE delivery_log (
  id TEXT PRIMARY KEY,
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  title TEXT,
  delivered_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX delivery_by_recipient ON delivery_log (recipient_did, created_at DESC);

-- Inbox: the canonical history of every accepted `send`. Routing only decides
-- which alert channels also fire; everything lands here regardless. `read_at`
-- null = unread; `actors` is a JSON array of handles/DIDs.
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

-- Categories per (recipient, sender): auto-discovered from `send`, or declared up
-- front by an app (setCategories/addCategory). `category` is the routing key; the
-- optional `title` is a human display name (e.g. a webhook's name). Per-user by
-- construction (recipient_did in the PK) — never shared across users.
CREATE TABLE app_categories (
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT,
  description TEXT,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (recipient_did, sender_did, category)
);
CREATE INDEX app_categories_by_pair ON app_categories (recipient_did, sender_did);

-- Routing, resolved bottom-up per notification:
--   category (routing) → app (app_routing) → account default (users.default_route)
-- A missing row at a level means "inherit the next level up". Route values are
-- '+'-joined token sets / 'off' (see lexicons/rpc.ts).
CREATE TABLE routing (
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  category TEXT NOT NULL,
  route TEXT NOT NULL,
  PRIMARY KEY (recipient_did, sender_did, category)
);
CREATE INDEX routing_by_recipient ON routing (recipient_did);

CREATE TABLE app_routing (
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  route TEXT NOT NULL,
  PRIMARY KEY (recipient_did, sender_did)
);
