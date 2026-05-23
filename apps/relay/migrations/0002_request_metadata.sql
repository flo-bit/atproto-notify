-- Revised requestPermission: the requester supplies user-facing display metadata
-- (title/description/icon) for the sender, stored per pending request and copied
-- onto the grant on approval. The legacy `pending_requests.reason` column stays
-- (nullable, no longer written/read) to avoid a risky DROP COLUMN.

ALTER TABLE pending_requests ADD COLUMN title TEXT;
ALTER TABLE pending_requests ADD COLUMN description TEXT;
ALTER TABLE pending_requests ADD COLUMN icon_url TEXT;

ALTER TABLE grants ADD COLUMN title TEXT;
ALTER TABLE grants ADD COLUMN description TEXT;
ALTER TABLE grants ADD COLUMN icon_url TEXT;
