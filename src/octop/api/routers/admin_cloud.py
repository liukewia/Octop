"""Admin configuration for cloud-managed accounts.

Only a local admin can point the installation at a cloud account service. The
saved row lives in ``sso_providers`` (``kind = 'cloud'``) and the client secret
is sealed with the installation key, so this view never returns it.
"""

from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from octop.api.deps import get_server, require_admin
from octop.infra.auth.cloud.config import (
    CloudConfigError,
    save_config,
)
from octop.infra.errors import ErrorCode, OctopError

router = APIRouter()


class CloudConfigBody(BaseModel):
    enabled: bool = False
    display_name: str = Field(default="", max_length=64)
    base_url: str = Field(default="", max_length=512)
    client_id: str = Field(default="", max_length=256)
    # Omit or leave blank to keep the stored secret.
    client_secret: str | None = Field(default=None, max_length=512)
    allow_admin: bool = True
    auto_provision: bool = True
    sync_permissions: bool = True
    offline_grace_seconds: int = Field(default=7 * 24 * 3600, ge=0, le=30 * 24 * 3600)
    request_timeout_seconds: int = Field(default=10, ge=3, le=30)
    signup_url: str | None = Field(default=None, max_length=512)


@router.get("", summary="Read the cloud account configuration")
async def read_config(
    _: Any = Depends(require_admin()),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return cast(dict[str, Any], server.cloud_account_service.admin_view())


@router.put("", summary="Save the cloud account configuration")
async def write_config(
    body: CloudConfigBody,
    _: Any = Depends(require_admin()),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    if body.enabled:
        if not body.base_url.strip() or not body.client_id.strip():
            msg = "service URL and client id are required to enable cloud sign-in"
            raise OctopError(
                ErrorCode.CLOUD_ACCOUNT_BAD_REQUEST,
                msg,
                details={"detail": msg},
            )
        existing = server.cloud_account_service.config()
        has_secret = bool(body.client_secret and body.client_secret.strip()) or bool(
            existing and existing.client_secret
        )
        if not has_secret:
            msg = "client secret is required to enable cloud sign-in"
            raise OctopError(
                ErrorCode.CLOUD_ACCOUNT_BAD_REQUEST,
                msg,
                details={"detail": msg},
            )
    try:
        save_config(
            server.services,
            enabled=body.enabled,
            display_name=body.display_name,
            base_url=body.base_url,
            client_id=body.client_id,
            client_secret=body.client_secret,
            allow_admin=body.allow_admin,
            auto_provision=body.auto_provision,
            sync_permissions=body.sync_permissions,
            offline_grace_seconds=body.offline_grace_seconds,
            request_timeout_seconds=body.request_timeout_seconds,
            signup_url=body.signup_url,
        )
    except CloudConfigError as exc:
        raise OctopError(
            ErrorCode.CLOUD_ACCOUNT_BAD_REQUEST,
            str(exc),
            details={"detail": str(exc)},
        ) from exc
    return cast(dict[str, Any], server.cloud_account_service.admin_view())


@router.post("/test", summary="Probe the configured cloud service")
async def test_connection(
    _: Any = Depends(require_admin()),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return cast(dict[str, Any], await server.cloud_account_service.probe())


@router.post("/sync", summary="Re-pull cloud profiles for active sessions")
async def sync_profiles(
    _: Any = Depends(require_admin()),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return cast(dict[str, Any], await server.cloud_account_service.sync_profiles())


@router.delete("/sessions/{user_id}", summary="Force a cloud user offline locally")
async def revoke_sessions(
    user_id: int,
    _: Any = Depends(require_admin()),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    revoked = server.cloud_account_service.revoke_user_sessions(user_id)
    return {"revoked": revoked}
