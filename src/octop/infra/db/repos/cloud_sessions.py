"""Local records of cloud sign-ins.

A cloud account has no local password, so the local JWT is minted here after the
cloud service has authenticated the person. Each mint gets a row in
``cloud_sessions``; the JWT carries ``session_id`` as the ``cs`` claim, which is
what makes revocation and the offline grace window enforceable:

* ``grace_expires_at`` caps how long a cached sign-in keeps working while the
  cloud is unreachable.
* ``revoked_at`` is set by logout, by an admin action, or when the cloud rejects
  the refresh token.
* ``refresh_token_enc`` is the sealed cloud refresh token, only readable through
  the installation's Fernet key, and only used from the local backend.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from octop.infra.db.pool import DatabasePool
from octop.infra.db.repos._base import DbRow, map_rows, now_ts


@dataclass(frozen=True)
class CloudSessionRow:
    id: int
    session_id: str
    user_id: int
    refresh_token_enc: bytes | None
    device_label: str | None
    cloud_expires_at: int
    grace_expires_at: int
    revoked_at: int | None
    created_at: int
    last_seen_at: int

    @classmethod
    def from_row(cls, r: DbRow) -> CloudSessionRow:
        keys = set(r.keys())
        token = r["refresh_token_enc"] if "refresh_token_enc" in keys else None
        return cls(
            id=int(r["id"]),
            session_id=str(r["session_id"]),
            user_id=int(r["user_id"]),
            refresh_token_enc=bytes(token) if token is not None else None,
            device_label=(str(r["device_label"]) if r["device_label"] else None)
            if "device_label" in keys
            else None,
            cloud_expires_at=int(r["cloud_expires_at"] or 0),
            grace_expires_at=int(r["grace_expires_at"] or 0),
            revoked_at=int(r["revoked_at"]) if r["revoked_at"] is not None else None,
            created_at=int(r["created_at"]),
            last_seen_at=int(r["last_seen_at"]),
        )

    def is_active(self, now: int | None = None) -> bool:
        ts = int(time.time()) if now is None else now
        if self.revoked_at is not None:
            return False
        return self.grace_expires_at > ts


class CloudSessionRepo:
    def __init__(self, db: DatabasePool) -> None:
        self._db = db

    def create(
        self,
        *,
        session_id: str,
        user_id: int,
        refresh_token_enc: bytes | None,
        device_label: str | None,
        cloud_expires_at: int,
        grace_expires_at: int,
    ) -> None:
        ts = now_ts()
        with self._db.transaction() as conn:
            conn.execute(
                "INSERT INTO cloud_sessions("
                "session_id, user_id, refresh_token_enc, device_label, "
                "cloud_expires_at, grace_expires_at, revoked_at, created_at, last_seen_at"
                ") VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)",
                (
                    session_id,
                    user_id,
                    refresh_token_enc,
                    device_label,
                    int(cloud_expires_at),
                    int(grace_expires_at),
                    ts,
                    ts,
                ),
            )

    def get(self, session_id: str) -> CloudSessionRow | None:
        with self._db.connect() as conn:
            r = conn.execute(
                "SELECT * FROM cloud_sessions WHERE session_id = ?", (session_id,)
            ).fetchone()
        return CloudSessionRow.from_row(r) if r else None

    def touch(
        self,
        session_id: str,
        *,
        refresh_token_enc: bytes | None = None,
        cloud_expires_at: int | None = None,
        grace_expires_at: int | None = None,
    ) -> None:
        fields = ["last_seen_at = ?"]
        params: list[object] = [now_ts()]
        if refresh_token_enc is not None:
            fields.append("refresh_token_enc = ?")
            params.append(refresh_token_enc)
        if cloud_expires_at is not None:
            fields.append("cloud_expires_at = ?")
            params.append(int(cloud_expires_at))
        if grace_expires_at is not None:
            fields.append("grace_expires_at = ?")
            params.append(int(grace_expires_at))
        params.append(session_id)
        with self._db.transaction() as conn:
            conn.execute(
                f"UPDATE cloud_sessions SET {', '.join(fields)} WHERE session_id = ?", params
            )

    def revoke(self, session_id: str, *, now: int | None = None) -> bool:
        ts = int(time.time()) if now is None else now
        with self._db.transaction() as conn:
            cur = conn.execute(
                "UPDATE cloud_sessions SET revoked_at = ? "
                "WHERE session_id = ? AND revoked_at IS NULL",
                (ts, session_id),
            )
            return int(cur.rowcount or 0) > 0

    def revoke_all_for_user(self, user_id: int, *, now: int | None = None) -> int:
        ts = int(time.time()) if now is None else now
        with self._db.transaction() as conn:
            cur = conn.execute(
                "UPDATE cloud_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
                (ts, user_id),
            )
            return int(cur.rowcount or 0)

    def list_active_for_user(
        self, user_id: int, *, now: int | None = None
    ) -> list[CloudSessionRow]:
        ts = int(time.time()) if now is None else now
        with self._db.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM cloud_sessions "
                "WHERE user_id = ? AND revoked_at IS NULL AND grace_expires_at > ? "
                "ORDER BY last_seen_at DESC",
                (user_id, ts),
            ).fetchall()
        return map_rows(rows, CloudSessionRow)

    def list_refreshable(self, *, now: int | None = None) -> list[CloudSessionRow]:
        """Sessions whose cloud token can still be refreshed for a profile sync."""
        ts = int(time.time()) if now is None else now
        with self._db.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM cloud_sessions "
                "WHERE revoked_at IS NULL AND grace_expires_at > ? "
                "AND refresh_token_enc IS NOT NULL "
                "ORDER BY last_seen_at DESC",
                (ts,),
            ).fetchall()
        return map_rows(rows, CloudSessionRow)

    def delete_expired(self, *, now: int | None = None) -> int:
        ts = int(time.time()) if now is None else now
        with self._db.transaction() as conn:
            cur = conn.execute(
                "DELETE FROM cloud_sessions WHERE grace_expires_at <= ? AND revoked_at IS NOT NULL",
                (ts,),
            )
            return int(cur.rowcount or 0)
