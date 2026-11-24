"""Cloud account orchestration: sign-in, session, refresh, revocation, sync.

The division of labour is the whole point of this module:

* the cloud service owns the account (password, MFA, role, permissions);
* this installation owns the runtime, the local JWT, and the offline grace
  window. A cloud sign-in is projected into the local ``users`` table and
  re-synced every time, so the local side is a cache with a lifetime, not a
  second source of truth.

Local accounts never pass through here.
"""

from __future__ import annotations

import asyncio
import secrets
import time
import weakref
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from octop.infra.auth.cloud.claims import CloudIdentity
from octop.infra.auth.cloud.client import CloudAuthError, CloudClient, CloudToken
from octop.infra.auth.cloud.config import CloudAccountConfig, load_config
from octop.infra.auth.ldap.throttle import LdapBindThrottle
from octop.infra.auth.mfa.service import MfaService
from octop.infra.auth.sso.crypto import decrypt_secret, encrypt_secret
from octop.infra.db.services import SharedServices
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.users.identity import User
from octop.infra.users.manager import UserManager

#: A sync pass is an admin action, not a batch job; keep it bounded.
MAX_SYNC_SESSIONS = 25


@dataclass
class IssuedCloudSession:
    access_token: str
    expires_in: int
    session_id: str
    user: User
    grace_expires_at: int


class CloudAccountService:
    """Process-level facade. One instance per running server."""

    def __init__(
        self,
        services: SharedServices,
        user_manager: UserManager,
        *,
        client_factory: Callable[[CloudAccountConfig], CloudClient] | None = None,
    ) -> None:
        self._services = services
        self._user_manager = user_manager
        self._client_factory = client_factory or (lambda cfg: CloudClient(cfg))
        self._throttle = LdapBindThrottle(
            max_attempts=services.config.login_max_attempts,
            window_seconds=60,
            block_seconds=services.config.login_lockout_seconds,
        )
        self._session_locks: weakref.WeakValueDictionary[str, asyncio.Lock] = (
            weakref.WeakValueDictionary()
        )

    def _session_lock(self, session_id: str) -> asyncio.Lock:
        lock = self._session_locks.get(session_id)
        if lock is None:
            lock = asyncio.Lock()
            self._session_locks[session_id] = lock
        return lock

    # ----- configuration -------------------------------------------------

    def config(self) -> CloudAccountConfig | None:
        return load_config(self._services)

    def _require_config(self) -> CloudAccountConfig:
        cfg = self.config()
        if cfg is None or not cfg.configured:
            raise OctopError(
                ErrorCode.CLOUD_ACCOUNT_NOT_CONFIGURED,
                "cloud account service is not configured",
            )
        if not cfg.enabled:
            raise OctopError(
                ErrorCode.CLOUD_ACCOUNT_NOT_CONFIGURED,
                "cloud account sign-in is disabled",
            )
        return cfg

    def status(self) -> dict[str, Any]:
        """Public payload for the login page. Never includes client credentials."""
        cfg = self.config()
        if cfg is None or not cfg.configured:
            return {
                "enabled": False,
                "configured": False,
                "display_name": "",
                "issuer": "",
                "signup_url": None,
                "offline_grace_seconds": 0,
            }
        return {
            "enabled": bool(cfg.enabled),
            "configured": True,
            "display_name": cfg.display_name or cfg.base_url,
            "issuer": cfg.base_url,
            "signup_url": cfg.signup_url,
            "offline_grace_seconds": cfg.offline_grace_seconds,
        }

    def admin_view(self) -> dict[str, Any]:
        """Admin payload: configuration plus projection counters."""
        cfg = self.config()
        return {
            "configured": cfg is not None and cfg.configured,
            "enabled": bool(cfg.enabled) if cfg else False,
            "display_name": cfg.display_name if cfg else "",
            "base_url": cfg.base_url if cfg else "",
            "client_id": cfg.client_id if cfg else "",
            "has_secret": bool(cfg.client_secret) if cfg else False,
            "allow_admin": cfg.allow_admin if cfg else True,
            "auto_provision": cfg.auto_provision if cfg else True,
            "sync_permissions": cfg.sync_permissions if cfg else True,
            "offline_grace_seconds": cfg.offline_grace_seconds if cfg else 0,
            "request_timeout_seconds": cfg.request_timeout_seconds if cfg else 0,
            "signup_url": cfg.signup_url if cfg else None,
            "cloud_user_count": self._services.user_repo.count_by_source("cloud"),
        }

    async def probe(self) -> dict[str, Any]:
        cfg = self._require_config()
        try:
            payload = await self._client_factory(cfg).probe()
        except CloudAuthError as exc:
            raise self._to_octop_error(exc) from exc
        return {
            "ok": True,
            "issuer": cfg.base_url,
            "service": payload.get("service") or payload.get("name") or "cloud",
            "version": payload.get("version"),
        }

    # ----- sign-in -------------------------------------------------------

    async def login(
        self,
        *,
        username: str,
        password: str,
        otp: str | None,
        mfa_token: str | None,
        client_ip: str,
        device_label: str | None = None,
    ) -> dict[str, Any] | IssuedCloudSession:
        cfg = self._require_config()
        identifier = (username or "").strip()
        if not identifier or not password:
            raise OctopError(ErrorCode.AUTH_FAILED, "username and password are required")
        retry_after = self._throttle.retry_after(identifier, client_ip)
        self._raise_if_throttled(retry_after)

        client = self._client_factory(cfg)
        try:
            token = await client.password_login(
                username=identifier,
                password=password,
                otp=(otp or "").strip() or None,
                mfa_token=(mfa_token or "").strip() or None,
            )
        except CloudAuthError as exc:
            if exc.reason == "mfa_required":
                return {
                    "mfa_required": True,
                    "cloud": True,
                    "mfa_token": exc.mfa_token,
                    "methods": exc.methods or ["totp"],
                    "user_hint": identifier,
                }
            if exc.reason in ("invalid_credentials", "mfa_invalid"):
                retry_after = self._throttle.record_failure(identifier, client_ip)
                self._services.audit_repo.write(
                    actor=identifier, action="auth.cloud_failed", target=identifier
                )
                self._raise_if_throttled(retry_after)
            raise self._to_octop_error(exc) from exc
        self._throttle.clear(identifier, client_ip)

        identity = await self._identity_from_token(client, token, fallback_username=identifier)
        user = await self._project(cfg, identity)
        self._services.audit_repo.write(actor=user.username, action="auth.cloud_login")
        return self._start_session(cfg, user, token, device_label=device_label)

    async def refresh(self, access_token: str) -> IssuedCloudSession:
        """Renew a local JWT from the cloud, using an expired local token as the key.

        The signature is still verified; only ``exp`` is ignored. The session row
        supplies the sealed refresh token, so the browser never holds one.
        """
        cfg = self._require_config()
        secret = self._services.secret_repo.get("jwt")
        if secret is None:
            raise OctopError(ErrorCode.INTERNAL_ERROR, "jwt secret missing")
        from octop.infra.auth.tokens import (
            PURPOSE_ACCESS,
            InvalidToken,
            decode_token,
            token_cloud_session,
            token_purpose,
        )

        try:
            payload = decode_token(secret, access_token, verify_expiry=False)
            if token_purpose(payload) != PURPOSE_ACCESS:
                raise InvalidToken("wrong token purpose")
            session_id = token_cloud_session(payload)
            token_uid = int(payload.get("sub") or 0)
        except (InvalidToken, TypeError, ValueError) as exc:
            raise OctopError(ErrorCode.AUTH_FAILED, "invalid token") from exc
        if session_id is None or token_uid <= 0:
            raise OctopError(ErrorCode.AUTH_FAILED, "not a cloud session")

        async with self._session_lock(session_id):
            session = self._services.cloud_session_repo.get(session_id)
            if session is None or not session.is_active() or session.user_id != token_uid:
                raise OctopError(
                    ErrorCode.CLOUD_ACCOUNT_SESSION_REVOKED, "cloud session is no longer valid"
                )
            if not session.refresh_token_enc:
                raise OctopError(ErrorCode.AUTH_FAILED, "cloud session cannot be refreshed")
            try:
                refresh_token = decrypt_secret(self._services.secret_repo, session.refresh_token_enc)
            except Exception as exc:
                raise OctopError(ErrorCode.AUTH_FAILED, "cloud session cannot be refreshed") from exc

            client = self._client_factory(cfg)
            try:
                token = await client.refresh(refresh_token)
            except CloudAuthError as exc:
                if exc.reason in ("invalid_credentials", "invalid_client", "account_disabled"):
                    self._services.cloud_session_repo.revoke(session_id)
                raise self._to_octop_error(exc) from exc

            identity = await self._identity_from_token(client, token, fallback_username="")
            user = await self._project(cfg, identity)
            if user.id != session.user_id:
                raise OctopError(
                    ErrorCode.CLOUD_ACCOUNT_SESSION_REVOKED, "cloud session identity mismatch"
                )
            current = self._services.cloud_session_repo.get(session_id)
            if current is None or not current.is_active():
                raise OctopError(
                    ErrorCode.CLOUD_ACCOUNT_SESSION_REVOKED, "cloud session is no longer valid"
                )
            return self._rotate_session(cfg, user, token, session_id=session_id)

    async def logout(self, session_id: str | None) -> None:
        if not session_id:
            return
        session = self._services.cloud_session_repo.get(session_id)
        if session is None:
            return
        if session.refresh_token_enc:
            try:
                token = decrypt_secret(self._services.secret_repo, session.refresh_token_enc)
                cfg = self.config()
                if cfg is not None and cfg.configured:
                    await self._client_factory(cfg).revoke(token)
            except Exception:
                pass
        self._services.cloud_session_repo.revoke(session_id)

    def revoke_user_sessions(self, user_id: int) -> int:
        return self._services.cloud_session_repo.revoke_all_for_user(user_id)

    # ----- self-service session management -------------------------------

    def list_own_sessions(
        self, user_id: int, *, current_session_id: str | None = None
    ) -> list[dict[str, Any]]:
        """Active sign-ins for one person, so a device can be dropped by hand.

        Only fields an end user needs are exposed: no refresh token, no row id,
        and no other account's data.
        """
        rows = self._services.cloud_session_repo.list_active_for_user(user_id)
        return [
            {
                "session_id": row.session_id,
                "device_label": row.device_label,
                "created_at": row.created_at,
                "last_seen_at": row.last_seen_at,
                "cloud_expires_at": row.cloud_expires_at,
                "grace_expires_at": row.grace_expires_at,
                "current": row.session_id == current_session_id,
            }
            for row in rows
        ]

    async def revoke_own_session(self, user_id: int, session_id: str) -> bool:
        """Revoke a sign-in owned by ``user_id``. Foreign ids are a silent miss."""
        row = self._services.cloud_session_repo.get(session_id)
        if row is None or row.user_id != user_id or row.revoked_at is not None:
            return False
        await self.logout(session_id)
        return True

    async def revoke_other_sessions(self, user_id: int, *, keep_session_id: str | None) -> int:
        """Sign out every device except the one making the request."""
        revoked = 0
        for row in self._services.cloud_session_repo.list_active_for_user(user_id):
            if row.session_id == keep_session_id:
                continue
            await self.logout(row.session_id)
            revoked += 1
        return revoked

    # ----- admin sync ----------------------------------------------------

    async def sync_profiles(self) -> dict[str, Any]:
        """Re-pull cloud profiles for sessions that can still refresh."""
        cfg = self._require_config()
        sessions = self._services.cloud_session_repo.list_refreshable()[:MAX_SYNC_SESSIONS]
        client = self._client_factory(cfg)
        updated = 0
        failed = 0
        errors: list[dict[str, str]] = []
        for session in sessions:
            if not session.refresh_token_enc:
                continue
            try:
                async with self._session_lock(session.session_id):
                    fresh = self._services.cloud_session_repo.get(session.session_id)
                    if fresh is None or not fresh.is_active() or not fresh.refresh_token_enc:
                        continue
                    refresh_token = decrypt_secret(
                        self._services.secret_repo, fresh.refresh_token_enc
                    )
                    token = await client.refresh(refresh_token)
                    identity = await self._identity_from_token(client, token, fallback_username="")
                    await self._project(cfg, identity)
                    now = int(time.time())
                    self._services.cloud_session_repo.touch(
                        session.session_id,
                        refresh_token_enc=(
                            encrypt_secret(self._services.secret_repo, token.refresh_token)
                            if token.refresh_token
                            else None
                        ),
                        cloud_expires_at=now + token.expires_in,
                        grace_expires_at=self._grace_expires_at(cfg, token, now),
                        update_last_seen=False,
                    )
                    updated += 1
            except CloudAuthError as exc:
                failed += 1
                if exc.reason in ("invalid_credentials", "account_disabled"):
                    self._services.cloud_session_repo.revoke(session.session_id)
                errors.append({"session_id": session.session_id, "reason": exc.reason})
            except Exception as exc:  # a bad row must not abort the whole pass
                failed += 1
                errors.append({"session_id": session.session_id, "reason": str(exc)})
        return {"checked": len(sessions), "updated": updated, "failed": failed, "errors": errors}

    # ----- internals -----------------------------------------------------

    async def _identity_from_token(
        self,
        client: CloudClient,
        token: CloudToken,
        *,
        fallback_username: str,
    ) -> CloudIdentity:
        document = token.user
        if not document:
            try:
                document = await client.userinfo(token.access_token)
            except CloudAuthError as exc:
                raise self._to_octop_error(exc) from exc
        try:
            return CloudIdentity.from_user_document(document, fallback_username=fallback_username)
        except CloudAuthError as exc:
            raise self._to_octop_error(exc) from exc

    async def _project(self, cfg: CloudAccountConfig, identity: CloudIdentity) -> User:
        return await self._user_manager.resolve_or_create_cloud_user(
            issuer=cfg.issuer,
            subject=identity.subject,
            username=identity.username,
            display_name=identity.display_name,
            email=identity.email,
            role=identity.role,
            permissions=identity.permissions if cfg.sync_permissions else None,
            locale=identity.locale,
            allow_admin=cfg.allow_admin,
            auto_provision=cfg.auto_provision,
        )

    @staticmethod
    def _grace_expires_at(cfg: CloudAccountConfig, token: CloudToken, now: int) -> int:
        if cfg.offline_grace_seconds == 0:
            # Online-only: the local session lives no longer than the cloud token.
            return now + token.expires_in
        return now + max(cfg.offline_grace_seconds, token.expires_in)

    def _start_session(
        self,
        cfg: CloudAccountConfig,
        user: User,
        token: CloudToken,
        *,
        device_label: str | None,
    ) -> IssuedCloudSession:
        now = int(time.time())
        grace_expires_at = self._grace_expires_at(cfg, token, now)
        ttl = min(
            int(self._services.config.access_token_ttl_seconds), max(60, grace_expires_at - now)
        )
        if cfg.offline_grace_seconds == 0:
            # No grace: the local token must not outlive the cloud one.
            ttl = min(ttl, token.expires_in)
        session_id = secrets.token_urlsafe(24)
        enc = (
            encrypt_secret(self._services.secret_repo, token.refresh_token)
            if token.refresh_token
            else None
        )
        self._services.cloud_session_repo.create(
            session_id=session_id,
            user_id=user.id,
            refresh_token_enc=enc,
            device_label=device_label,
            cloud_expires_at=now + token.expires_in,
            grace_expires_at=grace_expires_at,
        )
        jwt_token, issued_ttl = MfaService(self._services).mint_access_token(
            user, cloud_session=session_id, ttl_seconds=ttl
        )
        return IssuedCloudSession(
            access_token=jwt_token,
            expires_in=issued_ttl,
            session_id=session_id,
            user=user,
            grace_expires_at=grace_expires_at,
        )

    def _rotate_session(
        self,
        cfg: CloudAccountConfig,
        user: User,
        token: CloudToken,
        *,
        session_id: str,
    ) -> IssuedCloudSession:
        now = int(time.time())
        grace = self._grace_expires_at(cfg, token, now)
        ttl = min(int(self._services.config.access_token_ttl_seconds), max(60, grace - now))
        if cfg.offline_grace_seconds == 0:
            ttl = min(ttl, token.expires_in)
        self._services.cloud_session_repo.touch(
            session_id,
            refresh_token_enc=(
                encrypt_secret(self._services.secret_repo, token.refresh_token)
                if token.refresh_token
                else None
            ),
            cloud_expires_at=now + token.expires_in,
            grace_expires_at=grace,
        )
        jwt_token, issued_ttl = MfaService(self._services).mint_access_token(
            user, cloud_session=session_id, ttl_seconds=ttl
        )
        return IssuedCloudSession(
            access_token=jwt_token,
            expires_in=issued_ttl,
            session_id=session_id,
            user=user,
            grace_expires_at=grace,
        )

    def _raise_if_throttled(self, retry_after: int) -> None:
        if retry_after <= 0:
            return
        minutes = max(1, (retry_after + 59) // 60)
        raise OctopError(
            ErrorCode.LOGIN_LOCKED,
            "too many cloud sign-in attempts",
            details={"retry_after_seconds": retry_after, "minutes": minutes},
        )

    @staticmethod
    def _to_octop_error(exc: CloudAuthError) -> OctopError:
        if exc.reason == "account_disabled":
            return OctopError(ErrorCode.CLOUD_ACCOUNT_DISABLED, exc.message or "account disabled")
        if exc.reason in ("invalid_credentials", "mfa_invalid"):
            return OctopError(ErrorCode.AUTH_FAILED, "invalid credentials")
        if exc.reason == "invalid_client":
            return OctopError(
                ErrorCode.CLOUD_ACCOUNT_NOT_CONFIGURED,
                "cloud service rejected this installation's credentials",
            )
        if exc.reason == "rate_limited":
            minutes = max(1, (exc.retry_after + 59) // 60)
            return OctopError(
                ErrorCode.LOGIN_LOCKED,
                "cloud service is rate limiting sign-ins",
                details={"retry_after_seconds": exc.retry_after, "minutes": minutes},
            )
        return OctopError(
            ErrorCode.CLOUD_ACCOUNT_UNAVAILABLE,
            exc.message or "cloud account service is unavailable",
        )
