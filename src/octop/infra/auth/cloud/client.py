"""HTTP client for the cloud account service.

The contract is deliberately small, and it is the one this repository documents
for a cloud deployment (see ``docs/CLOUD_ACCOUNTS.zh.md``):

``POST /api/v1/auth/token`` (JSON)
    Password grant::

        {"grant_type": "password", "username": "...", "password": "...",
         "otp": "123456", "mfa_token": "...",
         "client_id": "...", "client_secret": "...", "scope": "openid profile email"}

    Refresh grant::

        {"grant_type": "refresh_token", "refresh_token": "...",
         "client_id": "...", "client_secret": "..."}

    Success (200)::

        {"access_token": "...", "refresh_token": "...", "token_type": "Bearer",
         "expires_in": 3600,
         "user": {"sub": "...", "username": "...", "name": "...", "email": "...",
                  "role": "admin|user", "permissions": ["chat"], "locale": "zh",
                  "tenant": "..."}}

    A second factor in progress (200 with ``mfa_required``) or a 401 with an
    ``error`` field both map onto :class:`CloudAuthError`.

``GET /api/v1/auth/userinfo`` with ``Authorization: Bearer <access_token>``
    Returns the same ``user`` object. Used when the token response omitted it,
    and for profile re-sync.

``POST /api/v1/auth/revoke`` ``{"token": "..."}`` — best effort on logout.

The cloud access token is never trusted as a local credential: this backend
always asks for the ``user`` document over TLS, then mints its own local JWT.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import httpx

from octop.infra.auth.cloud.config import (
    HEALTH_PATH,
    REVOKE_PATH,
    TOKEN_PATH,
    USERINFO_PATH,
    CloudAccountConfig,
)


@dataclass
class CloudToken:
    access_token: str
    refresh_token: str | None
    expires_in: int
    user: dict[str, Any] | None = None

    @property
    def has_user(self) -> bool:
        return isinstance(self.user, dict) and bool(self.user)


@dataclass
class CloudAuthError(Exception):
    """A cloud answer that is not a usable session.

    ``reason`` is stable and drives both the local error code and the UI copy:
    ``invalid_credentials``, ``mfa_required``, ``mfa_invalid``,
    ``account_disabled``, ``invalid_client``, ``rate_limited``, ``unavailable``,
    ``invalid_response``.
    """

    reason: str
    message: str = ""
    status: int = 0
    mfa_token: str | None = None
    methods: list[str] = field(default_factory=list)
    retry_after: int = 0

    def __str__(self) -> str:  # pragma: no cover - debugging aid
        return f"{self.reason}: {self.message}"


_REASON_BY_ERROR = {
    "invalid_credentials": "invalid_credentials",
    "invalid_grant": "invalid_credentials",
    "invalid_password": "invalid_credentials",
    "mfa_required": "mfa_required",
    "mfa_invalid": "mfa_invalid",
    "invalid_otp": "mfa_invalid",
    "account_disabled": "account_disabled",
    "user_disabled": "account_disabled",
    "invalid_client": "invalid_client",
    "unauthorized_client": "invalid_client",
    "rate_limited": "rate_limited",
    "too_many_attempts": "rate_limited",
}


class CloudClient:
    def __init__(
        self,
        config: CloudAccountConfig,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._config = config
        self._transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._config.base_url,
            timeout=float(self._config.request_timeout_seconds),
            follow_redirects=False,
            transport=self._transport,
        )

    async def password_login(
        self,
        *,
        username: str,
        password: str,
        otp: str | None = None,
        mfa_token: str | None = None,
    ) -> CloudToken:
        payload: dict[str, Any] = {
            "grant_type": "password",
            "username": username,
            "password": password,
            "client_id": self._config.client_id,
            "client_secret": self._config.client_secret,
            "scope": "openid profile email",
        }
        if otp:
            payload["otp"] = otp
        if mfa_token:
            payload["mfa_token"] = mfa_token
        return await self._token_request(payload)

    async def refresh(self, refresh_token: str) -> CloudToken:
        return await self._token_request(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": self._config.client_id,
                "client_secret": self._config.client_secret,
            }
        )

    async def revoke(self, token: str) -> None:
        """Best effort: a failed revoke must not block the local logout."""
        try:
            async with self._client() as client:
                await client.post(
                    REVOKE_PATH,
                    json={
                        "token": token,
                        "client_id": self._config.client_id,
                        "client_secret": self._config.client_secret,
                    },
                )
        except httpx.HTTPError:
            return

    async def userinfo(self, access_token: str) -> dict[str, Any]:
        try:
            async with self._client() as client:
                response = await client.get(
                    USERINFO_PATH,
                    headers={"authorization": f"Bearer {access_token}"},
                )
        except httpx.HTTPError as exc:
            raise CloudAuthError("unavailable", str(exc)) from exc
        data = _json_or_none(response)
        if response.status_code != 200 or not isinstance(data, dict):
            raise _error_from_response(response, data)
        user = data.get("user") if isinstance(data.get("user"), dict) else data
        if not isinstance(user, dict) or not user:
            raise CloudAuthError("invalid_response", "userinfo returned no user")
        return user

    async def probe(self) -> dict[str, Any]:
        try:
            async with self._client() as client:
                response = await client.get(HEALTH_PATH, timeout=5.0)
        except httpx.HTTPError as exc:
            raise CloudAuthError("unavailable", str(exc)) from exc
        data = _json_or_none(response)
        if response.status_code != 200:
            raise CloudAuthError(
                "unavailable",
                f"health check returned {response.status_code}",
                status=response.status_code,
            )
        return data if isinstance(data, dict) else {}

    # ----- internals -----------------------------------------------------

    async def _token_request(self, payload: dict[str, Any]) -> CloudToken:
        try:
            async with self._client() as client:
                response = await client.post(TOKEN_PATH, json=payload)
        except httpx.HTTPError as exc:
            raise CloudAuthError("unavailable", str(exc)) from exc

        data = _json_or_none(response)
        if response.status_code == 200 and isinstance(data, dict):
            if data.get("mfa_required"):
                raise CloudAuthError(
                    "mfa_required",
                    str(data.get("error_description") or "second factor required"),
                    mfa_token=_optional_str(data.get("mfa_token")),
                    methods=_string_list(data.get("methods")),
                )
            return _token_from_payload(data)
        raise _error_from_response(response, data)


def _optional_str(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _string_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    return []


def _json_or_none(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return None


def _token_from_payload(data: dict[str, Any]) -> CloudToken:
    access = _optional_str(data.get("access_token"))
    if access is None:
        raise CloudAuthError("invalid_response", "token response has no access_token")
    try:
        expires_in = int(data.get("expires_in") or 3600)
    except (TypeError, ValueError):
        expires_in = 3600
    user = data.get("user")
    return CloudToken(
        access_token=access,
        refresh_token=_optional_str(data.get("refresh_token")),
        expires_in=max(60, expires_in),
        user=user if isinstance(user, dict) else None,
    )


def _error_from_response(response: httpx.Response, data: Any) -> CloudAuthError:
    body = data if isinstance(data, dict) else {}
    raw_error = str(body.get("error") or body.get("code") or "").strip().lower()
    message = str(body.get("error_description") or body.get("message") or "").strip()
    if body.get("mfa_required") or raw_error == "mfa_required":
        return CloudAuthError(
            "mfa_required",
            message or "second factor required",
            status=response.status_code,
            mfa_token=_optional_str(body.get("mfa_token")),
            methods=_string_list(body.get("methods")),
        )
    if response.status_code == 429:
        retry_after = 0
        try:
            retry_after = int(response.headers.get("retry-after") or 0)
        except ValueError:
            retry_after = 0
        return CloudAuthError(
            "rate_limited",
            message or "too many attempts",
            status=429,
            retry_after=max(0, retry_after),
        )
    reason = _REASON_BY_ERROR.get(raw_error)
    if reason is None:
        reason = "invalid_credentials" if response.status_code in (400, 401) else "unavailable"
    return CloudAuthError(
        reason,
        message or f"cloud service returned {response.status_code}",
        status=response.status_code,
    )
