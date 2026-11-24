"""Cloud account configuration, stored in ``sso_providers`` (``kind = 'cloud'``).

One row holds the whole contract: where the cloud identity service lives, the
client credentials this installation uses, and the policy knobs that decide how
much a local admin can still do. The client secret is sealed with the
installation's Fernet key, like every other provider secret.

The row is managed by a local admin. Nothing in this module talks to the cloud.
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from octop.infra.auth.sso.crypto import decrypt_secret, encrypt_secret
from octop.infra.db.repos.sso import SsoProviderRow
from octop.infra.db.services import SharedServices

CLOUD_KIND = "cloud"

DEFAULT_OFFLINE_GRACE_SECONDS = 7 * 24 * 3600
MAX_OFFLINE_GRACE_SECONDS = 30 * 24 * 3600
DEFAULT_REQUEST_TIMEOUT_SECONDS = 10
MIN_REQUEST_TIMEOUT_SECONDS = 3
MAX_REQUEST_TIMEOUT_SECONDS = 30

#: Fixed contract paths. Documented once here so the adapter and the cloud side
#: do not drift; deployments behind a gateway can still prefix the base URL.
TOKEN_PATH = "/api/v1/auth/token"
REVOKE_PATH = "/api/v1/auth/revoke"
USERINFO_PATH = "/api/v1/auth/userinfo"
HEALTH_PATH = "/api/v1/health"

_CLEARTEXT_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


class CloudConfigError(ValueError):
    """A submitted configuration value cannot be used."""


@dataclass(frozen=True)
class CloudAccountConfig:
    enabled: bool
    display_name: str
    base_url: str
    client_id: str
    client_secret: str
    allow_admin: bool = True
    auto_provision: bool = True
    sync_permissions: bool = True
    offline_grace_seconds: int = DEFAULT_OFFLINE_GRACE_SECONDS
    request_timeout_seconds: int = DEFAULT_REQUEST_TIMEOUT_SECONDS
    signup_url: str | None = None

    @property
    def issuer(self) -> str:
        """Stable identity namespace stored on every projected user row."""
        return self.base_url

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.client_id and self.client_secret)


def normalize_base_url(raw: str) -> str:
    """Validate and canonicalise the cloud service address.

    HTTPS everywhere except a loopback address, where a developer runs the mock
    service. Anything else would put the account password on the wire in clear.
    """
    text = (raw or "").strip()
    if not text:
        raise CloudConfigError("cloud service URL is required")
    parsed = urlparse(text)
    if parsed.scheme not in ("https", "http"):
        raise CloudConfigError("cloud service URL must be http(s)")
    if not parsed.hostname:
        raise CloudConfigError("cloud service URL has no host")
    if parsed.username or parsed.password:
        raise CloudConfigError("cloud service URL must not contain credentials")
    if parsed.query or parsed.fragment:
        raise CloudConfigError("cloud service URL must not carry a query or fragment")
    if parsed.scheme == "http":
        host = parsed.hostname.strip("[]").lower()
        loopback = host in _CLEARTEXT_HOSTS
        if not loopback:
            try:
                loopback = ipaddress.ip_address(host).is_loopback
            except ValueError:
                loopback = False
        if not loopback:
            raise CloudConfigError("cloud service URL must use https outside localhost")
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"


def normalize_signup_url(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    parsed = urlparse(text)
    if parsed.scheme not in ("https", "http") or not parsed.hostname:
        raise CloudConfigError("sign-up URL must be http(s)")
    return text


def _extra_bool(extra: dict[str, Any], key: str, default: bool) -> bool:
    value = extra.get(key, default)
    return bool(value)


def _extra_int(extra: dict[str, Any], key: str, default: int, minimum: int, maximum: int) -> int:
    raw = extra.get(key, default)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, value))


def load_config(services: SharedServices) -> CloudAccountConfig | None:
    """Return the stored configuration, or ``None`` when none was ever saved."""
    row = services.sso_repo.get_by_kind(CLOUD_KIND)
    if row is None:
        return None
    return _from_row(services, row)


def _from_row(services: SharedServices, row: SsoProviderRow) -> CloudAccountConfig:
    secret = ""
    if row.client_secret_enc:
        try:
            secret = decrypt_secret(services.secret_repo, row.client_secret_enc)
        except Exception:  # pragma: no cover - a rotated key must not brick login
            secret = ""
    extra = row.extra or {}
    return CloudAccountConfig(
        enabled=bool(row.enabled),
        display_name=row.display_name or "",
        base_url=row.issuer,
        client_id=row.client_id,
        client_secret=secret,
        allow_admin=_extra_bool(extra, "allow_admin", True),
        auto_provision=_extra_bool(extra, "auto_provision", True),
        sync_permissions=_extra_bool(extra, "sync_permissions", True),
        offline_grace_seconds=_extra_int(
            extra,
            "offline_grace_seconds",
            DEFAULT_OFFLINE_GRACE_SECONDS,
            0,
            MAX_OFFLINE_GRACE_SECONDS,
        ),
        request_timeout_seconds=_extra_int(
            extra,
            "request_timeout_seconds",
            DEFAULT_REQUEST_TIMEOUT_SECONDS,
            MIN_REQUEST_TIMEOUT_SECONDS,
            MAX_REQUEST_TIMEOUT_SECONDS,
        ),
        signup_url=(str(extra.get("signup_url") or "").strip() or None),
    )


def save_config(
    services: SharedServices,
    *,
    enabled: bool,
    display_name: str,
    base_url: str,
    client_id: str,
    client_secret: str | None,
    allow_admin: bool,
    auto_provision: bool,
    sync_permissions: bool,
    offline_grace_seconds: int,
    request_timeout_seconds: int,
    signup_url: str | None,
) -> CloudAccountConfig:
    """Persist the configuration. A ``None`` secret keeps the stored one."""
    normalized = normalize_base_url(base_url) if (base_url or "").strip() else ""
    secret_enc = (
        encrypt_secret(services.secret_repo, client_secret)
        if client_secret is not None and client_secret.strip()
        else None
    )
    extra = {
        "allow_admin": bool(allow_admin),
        "auto_provision": bool(auto_provision),
        "sync_permissions": bool(sync_permissions),
        "offline_grace_seconds": max(0, min(MAX_OFFLINE_GRACE_SECONDS, int(offline_grace_seconds))),
        "request_timeout_seconds": max(
            MIN_REQUEST_TIMEOUT_SECONDS,
            min(MAX_REQUEST_TIMEOUT_SECONDS, int(request_timeout_seconds)),
        ),
        "signup_url": normalize_signup_url(signup_url),
    }
    row = services.sso_repo.upsert_by_kind(
        CLOUD_KIND,
        enabled=enabled,
        display_name=display_name.strip(),
        issuer=normalized,
        client_id=client_id.strip(),
        client_secret_enc=secret_enc,
        scopes="openid profile email",
        dashboard_origin=None,
        extra=extra,
    )
    return _from_row(services, row)
