"""HttpOnly session cookie for browser logins.

The JWT still travels as ``Authorization: Bearer`` and as ``access_token`` in
JSON, so already-deployed clients keep working. A browser that cannot see the
token reads this cookie instead. ``Secure`` follows the request, the same way
the SSO state cookie does.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlparse

from fastapi import Request, WebSocket
from fastapi.responses import Response

from octop.api.common.sso_cookie import request_is_https

SESSION_COOKIE = "octop_session"
_TOKEN_ISSUING_PREFIXES = ("/api/auth/", "/api/setup/")


def websocket_cookie_origin_allowed(websocket: WebSocket, server: Any | None = None) -> bool:
    """Guard cookie-authenticated WebSockets against cross-port / sibling-subdomain hijacking."""
    origin = (websocket.headers.get("origin") or "").strip()
    if not origin:
        return False
    parsed = urlparse(origin)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False
    origin_norm = f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"
    host = (websocket.headers.get("host") or "").strip().lower()
    if host and parsed.netloc.lower() == host:
        return True
    if server is not None:
        services = getattr(server, "services", None)
        config = getattr(services, "config", None) if services is not None else None
        cors_origins = getattr(config, "cors_origins", None) if config is not None else None
        if isinstance(cors_origins, (list, tuple, set)):
            for allowed in cors_origins:
                if isinstance(allowed, str) and allowed.strip().rstrip("/").lower() == origin_norm:
                    return True
    return False


def cookie_token(cookies: Any) -> str | None:
    if cookies is None or not hasattr(cookies, "get"):
        return None
    raw = cookies.get(SESSION_COOKIE)
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None


def presented_access_token(query_token: str | None, cookies: Any) -> str | None:
    """Query token wins. The cookie covers a browser that did not put one in the URL."""
    if isinstance(query_token, str) and query_token.strip():
        return query_token.strip()
    return cookie_token(cookies)


def set_session_cookie(response: Response, request: Request, token: str, ttl_seconds: int) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=max(1, int(ttl_seconds)),
        path="/",
        httponly=True,
        secure=request_is_https(request),
        samesite="lax",
    )


def clear_session_cookie(response: Response, request: Request) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        httponly=True,
        secure=request_is_https(request),
        samesite="lax",
    )


async def maybe_attach_session_cookie(request: Request, response: Response) -> Response:
    """Copy a login JSON ``access_token`` into the session cookie.

    Issuing routes keep returning the token for Bearer clients. The cookie is
    added here so every issuer (login, MFA, passkey, OIDC, setup, invite) is
    covered without each handler knowing about it.

    HTTP middleware hands back a streaming response, so the JSON is not on
    ``response.body`` until the body iterator is read.
    """
    if not (200 <= response.status_code < 300):
        return response
    if not request.url.path.startswith(_TOKEN_ISSUING_PREFIXES):
        return response
    content_type = response.headers.get("content-type", "")
    if "json" not in content_type:
        return response
    body = getattr(response, "body", None)
    if not body:
        iterator = getattr(response, "body_iterator", None)
        if iterator is None:
            return response
        chunks: list[bytes] = []
        async for chunk in iterator:
            if isinstance(chunk, (bytes, bytearray)):
                chunks.append(bytes(chunk))
        body = b"".join(chunks)
        raw_headers = list(getattr(response, "raw_headers", []))
        rebuilt = Response(
            content=body,
            status_code=response.status_code,
        )
        if raw_headers:
            rebuilt.raw_headers = raw_headers
        response = rebuilt
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError):
        return response
    if not isinstance(payload, dict):
        return response
    token = payload.get("access_token")
    if not isinstance(token, str) or not token:
        return response
    expires = payload.get("expires_in")
    ttl = expires if isinstance(expires, int) and expires > 0 else 3600
    set_session_cookie(response, request, token, ttl)
    return response
