-- Email delivery channel: one address per user, verified by a short code emailed
-- via comail before the relay will deliver to it. See delivery/email.ts.
CREATE TABLE email_channels (
  recipient_did  TEXT PRIMARY KEY,
  address        TEXT NOT NULL,
  verified       INTEGER NOT NULL DEFAULT 0,
  verify_code    TEXT,
  verify_expires INTEGER,
  created_at     INTEGER NOT NULL
);
