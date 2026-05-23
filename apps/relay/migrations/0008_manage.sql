-- Per-grant management capability the user designates for an app:
--   'none' (default) → app may only send / self-read per relay policy
--   'self'           → app may manage its own slice (routing, inbox)
--   'full'           → app may manage the user's whole notification account
-- See MANAGEMENT-AUTH.md.
ALTER TABLE grants ADD COLUMN manage TEXT NOT NULL DEFAULT 'none';
