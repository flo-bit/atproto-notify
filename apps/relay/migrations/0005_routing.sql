-- Per-category routing (Phase 4).
--
-- app_categories: categories discovered from `send` (per recipient+sender), so
-- the routing UI can list them with a description. routing: per-category alert
-- override; absence means "inherit the user's default_route". Route tokens:
-- 'push' | 'telegram' | 'push+telegram' | 'off' (everything is in the inbox
-- regardless; the token only gates alert channels).

CREATE TABLE app_categories (
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (recipient_did, sender_did, category)
);
CREATE INDEX app_categories_by_pair ON app_categories (recipient_did, sender_did);

CREATE TABLE routing (
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  category TEXT NOT NULL,
  route TEXT NOT NULL,
  PRIMARY KEY (recipient_did, sender_did, category)
);
CREATE INDEX routing_by_recipient ON routing (recipient_did);

ALTER TABLE users ADD COLUMN default_route TEXT NOT NULL DEFAULT 'push';
