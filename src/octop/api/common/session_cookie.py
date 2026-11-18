"""HttpOnly session cookie for browser logins.

The JWT still travels as ``Authorization: Bearer`` and as ``access_token`` in
JSON, so already-deployed clients keep working. A browser that cannot see the
token reads this cookie instead. ``Secure`` follows the request, the same way
the SSO state cookie does.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import Request
from fastapi.responses import Response

from octop.api.common.sso_cookie import request_is_https

SESSION_COOKIE = "octop_session"


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
    response.delete_cookie(SESSION_COOKIE, path="/", secure=request_is_https(request))


async def maybe_attach_session_cookie(request: Request, response: Response) -> Response:
    """Copy a login JSON ``access_token`` into the session cookie.

    Issuing routes keep returning the token for Bearer clients. The cookie is
    added here so every issuer (login, MFA, passkey, OIDC, setup, invite) is
    covered without each handler knowing about it.

    HTTP middleware hands back a streaming response, so the JSON is not on
    ``response.body`` until the body iterator is read.
    """
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
        response = Response(
            content=body,
            status_code=response.status_code,
            headers=dict(response.headers),
        )
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
