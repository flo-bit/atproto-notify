-- App-wide routing + auto-allow policy.
--
-- Routing is now 3 levels, resolved bottom-up for each notification:
--   category (routing table)  →  app (app_routing)  →  user default (users.default_route)
-- A missing row at a level means "inherit the next level up". So a category with
-- no row inherits the app; an app with no row inherits the user default. Tokens
-- are concrete alert routes only: 'push' | 'telegram' | 'push+telegram' | 'off'.
CREATE TABLE app_routing (
  recipient_did TEXT NOT NULL,
  sender_did TEXT NOT NULL,
  route TEXT NOT NULL,
  PRIMARY KEY (recipient_did, sender_did)
);

-- Per-user policy for incoming permission requests (gates the requestPermission
-- auto-grant): 'all' (auto-grant anyone) | 'trusted' (only TRUSTED_SENDERS) |
-- 'none' (always require approval).
ALTER TABLE users ADD COLUMN auto_allow TEXT NOT NULL DEFAULT 'trusted';
