-- Schema v26: cloud-managed accounts running on a local installation.
--
-- A row whose ``source`` is ``cloud`` is a local projection of an account that
-- lives in the cloud identity service: no local password, no local role edits,
-- re-synced on every sign-in. ``local`` rows keep working exactly as before, so
-- one installation can hold both account systems side by side.
--
-- ``cloud_sessions`` is the local record of a cloud sign-in. The access token
-- carries its ``session_id`` as the ``cs`` claim, which is what lets an admin
-- revoke a cloud session without waiting for the JWT to expire.

ALTER TABLE users ADD COLUMN source TEXT NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN cloud_issuer TEXT;
ALTER TABLE users ADD COLUMN cloud_subject TEXT;
ALTER TABLE users ADD COLUMN cloud_synced_at INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cloud_identity
  ON users(cloud_issuer, cloud_subject)
  WHERE cloud_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS cloud_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id        TEXT NOT NULL UNIQUE,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_enc BLOB,
  device_label      TEXT,
  cloud_expires_at  INTEGER NOT NULL DEFAULT 0,
  grace_expires_at  INTEGER NOT NULL DEFAULT 0,
  revoked_at        INTEGER,
  created_at        INTEGER NOT NULL,
  last_seen_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cloud_sessions_user
  ON cloud_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_cloud_sessions_grace
  ON cloud_sessions(grace_expires_at);
