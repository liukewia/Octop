"""Cloud account sign-in for a locally running installation.

The local backend stays the only API surface the Dashboard talks to. These
endpoints broker a cloud session into a local JWT; every other route keeps
working unchanged.
"""

from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from octop.api.common.client_ip import resolve_client_ip
from octop.api.common.session_cookie import SESSION_COOKIE, clear_session_cookie
from octop.api.deps import current_user, extract_raw_token, get_server
from octop.api.routers.auth import me_payload
from octop.infra.auth.cloud.service import IssuedCloudSession
from octop.infra.errors import ErrorCode, OctopError

router = APIRouter()


class CloudLoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=1024)
    otp: str | None = Field(default=None, max_length=64)
    mfa_token: str | None = Field(default=None, max_length=4096)
    device_label: str | None = Field(default=None, max_length=64)


class CloudRefreshBody(BaseModel):
    """An expired local token, used only to locate the local cloud session."""

    access_token: str | None = Field(default=None, min_length=16, max_length=8192)


def _session_payload(issued: IssuedCloudSession, server: Any) -> dict[str, Any]:
    return {
        "access_token": issued.access_token,
        "token_type": "Bearer",
        "expires_in": issued.expires_in,
        "user": me_payload(issued.user, server),
        "cloud": True,
        "cloud_session_id": issued.session_id,
        "cloud_grace_expires_at": issued.grace_expires_at,
    }


@router.get("/status", summary="Cloud account sign-in availability")
async def status(server: Any = Depends(get_server)) -> dict[str, Any]:
    return cast(dict[str, Any], server.cloud_account_service.status())


@router.post("/login", summary="Sign in with a cloud account")
async def login(
    body: CloudLoginBody,
    request: Request,
    server: Any = Depends(get_server),
) -> Any:
    service = server.cloud_account_service
    result = await service.login(
        username=body.username,
        password=body.password,
        otp=body.otp,
        mfa_token=body.mfa_token,
        client_ip=resolve_client_ip(request),
        device_label=body.device_label,
    )
    if isinstance(result, dict):
        # Second factor in progress. The cloud's opaque challenge token travels
        # back to the caller and nowhere else.
        return result
    return _session_payload(result, server)


@router.post("/refresh", summary="Renew a cloud session without a password")
async def refresh(
    request: Request,
    body: CloudRefreshBody | None = None,
    server: Any = Depends(get_server),
) -> Any:
    token = (body.access_token if body is not None else None) or request.cookies.get(SESSION_COOKIE)
    if not token:
        raise OctopError(ErrorCode.AUTH_FAILED, "access token or session cookie is required")
    issued = await server.cloud_account_service.refresh(token)
    return _session_payload(issued, server)


@router.post("/logout", status_code=204, summary="Sign out of a cloud session")
async def logout(
    request: Request,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> Response:
    raw = _raw_token(request)
    session_id = _session_id_from_token(server, raw)
    await server.cloud_account_service.logout(session_id)
    server.services.audit_repo.write(actor=user.username, action="auth.cloud_logout")
    response = Response(status_code=204)
    clear_session_cookie(response, request)
    return response


@router.get("/sessions", summary="List my active cloud sign-ins")
async def list_sessions(
    request: Request,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    current = _session_id_from_token(server, _raw_token(request))
    return {
        "sessions": server.cloud_account_service.list_own_sessions(
            user.id, current_session_id=current
        )
    }


@router.delete("/sessions/{session_id}", status_code=204, summary="Revoke one cloud sign-in")
async def revoke_session(
    session_id: str,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> Response:
    revoked = await server.cloud_account_service.revoke_own_session(user.id, session_id)
    if not revoked:
        raise OctopError(ErrorCode.NOT_FOUND, "cloud session not found")
    server.services.audit_repo.write(
        actor=user.username, action="auth.cloud_revoke_session", target=session_id[:12]
    )
    return Response(status_code=204)


@router.delete("/sessions", summary="Revoke my other cloud sign-ins")
async def revoke_other_sessions(
    request: Request,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    current = _session_id_from_token(server, _raw_token(request))
    revoked = await server.cloud_account_service.revoke_other_sessions(
        user.id, keep_session_id=current
    )
    if revoked:
        server.services.audit_repo.write(
            actor=user.username, action="auth.cloud_revoke_sessions", target=str(revoked)
        )
    return {"revoked": revoked}


def _raw_token(request: Request) -> str | None:
    return extract_raw_token(
        authorization=request.headers.get("authorization"),
        access_token=request.query_params.get("access_token"),
        cookie=request.cookies.get(SESSION_COOKIE),
    )


def _session_id_from_token(server: Any, raw: str | None) -> str | None:
    if not raw:
        return None
    from octop.infra.auth.tokens import (
        InvalidToken,
        decode_token,
        token_cloud_session,
    )

    secret = server.services.secret_repo.get("jwt")
    if secret is None:
        return None
    try:
        payload = decode_token(secret, raw, verify_expiry=False)
        return token_cloud_session(payload)
    except InvalidToken:
        return None
