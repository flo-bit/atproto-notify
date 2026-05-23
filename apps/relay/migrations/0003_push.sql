-- Web push subscriptions (Phase 2). One row per browser PushSubscription; a
-- user can have several (multiple devices/browsers). Telegram channels stay in
-- the `channels` table; web push lives here because keys + endpoint don't fit
-- the (did, platform) shape and there are many per user.

CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,   -- unique per subscription; the push service URL
  did TEXT NOT NULL,
  p256dh TEXT NOT NULL,        -- client public key (base64url, uncompressed point)
  auth TEXT NOT NULL,          -- client auth secret (base64url, 16 bytes)
  created_at INTEGER NOT NULL
);
CREATE INDEX push_subs_by_did ON push_subscriptions (did);
