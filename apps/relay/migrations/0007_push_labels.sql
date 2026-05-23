-- Device labels for web push subscriptions (auto-detected from the User-Agent at
-- registration, user-renameable). Null = unnamed (UI shows a fallback).
ALTER TABLE push_subscriptions ADD COLUMN label TEXT;
