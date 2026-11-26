"""The browser checkbox is not an authorization boundary: enforce on HTTP too."""

from dataclasses import replace

import pytest

from octop.infra.auth.tokens import MAX_SESSION_SECONDS, decode_token
from tests.support.auth import bootstrap_admin


@pytest.fixture
async def policy_client(app_client):
    c, srv, home = app_client
    await bootstrap_admin(c, home, username="alice", password="TestPass12")
    object.__setattr__(
        srv.services,
        "config",
        replace(
            srv.services.config,
            login_consent_enabled=True,
            user_agreement_url="https://portal.example/terms",
            privacy_policy_url="https://portal.example/privacy",
        ),
    )
    return c, srv


async def test_public_policy(policy_client):
    c, _ = policy_client
    r = await c.get("/api/auth/login-policy")
    assert r.status_code == 200
    assert r.json() == {
        "enabled": True,
        "ready": True,
        "user_agreement_url": "https://portal.example/terms",
        "privacy_policy_url": "https://portal.example/privacy",
    }


@pytest.mark.parametrize(
    "extra,status",
    [
        ({}, 403),
        ({"consent_accepted": False}, 403),
        ({"consent_accepted": "true"}, 422),
        ({"consent_accepted": 1}, 422),
    ],
)
async def test_password_cannot_bypass_checkbox(policy_client, extra, status):
    c, _ = policy_client
    r = await c.post(
        "/api/auth/login", json={"username": "alice", "password": "TestPass12", **extra}
    )
    assert r.status_code == status


async def test_consent_allows_72h_login(policy_client):
    c, srv = policy_client
    r = await c.post(
        "/api/auth/login",
        json={"username": "alice", "password": "TestPass12", "consent_accepted": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["expires_in"] == MAX_SESSION_SECONDS
    token = r.json()["access_token"]
    payload = decode_token(srv.services.secret_repo.get("jwt"), token)
    assert payload["exp"] - payload["session_started_at"] == MAX_SESSION_SECONDS
    # Existing sessions need neither credentials nor another consent assertion.
    assert (
        await c.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    ).status_code == 200


async def test_enabled_without_urls_fails_closed(policy_client):
    c, srv = policy_client
    object.__setattr__(srv.services, "config", replace(srv.services.config, privacy_policy_url=""))
    assert (await c.get("/api/auth/login-policy")).json()["ready"] is False
    r = await c.post(
        "/api/auth/login",
        json={"username": "alice", "password": "TestPass12", "consent_accepted": True},
    )
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "LOGIN_POLICY_UNAVAILABLE"


@pytest.mark.parametrize(
    "path,body",
    [
        ("/api/auth/oauth/start", {"kind": "oidc"}),
        ("/api/auth/oidc/start", {}),
        ("/api/auth/passkey/login/verify", {"credential": {}}),
    ],
)
async def test_alternative_login_cannot_bypass_consent(policy_client, path, body):
    c, _ = policy_client
    r = await c.post(path, json=body)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "LOGIN_CONSENT_REQUIRED"


async def test_refresh_and_password_rotation_do_not_extend_deadline(app_client):
    import time

    from octop.infra.auth.tokens import PURPOSE_ACCESS, sign_token
    from tests.support.auth import bootstrap_admin

    c, srv, home = app_client
    await bootstrap_admin(c, home, username="alice", password="OldPass12")
    user = srv.user_manager.get("alice")
    secret = srv.services.secret_repo.get("jwt")
    started = int(time.time()) - MAX_SESSION_SECONDS + 120
    token = sign_token(
        secret,
        sub=user.id,
        uname=user.username,
        role=user.role,
        purpose=PURPOSE_ACCESS,
        session_started_at=started,
        ttl_seconds=60,
    )
    r = await c.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    refreshed = r.headers["X-Octop-Access-Token"]
    payload = decode_token(secret, refreshed)
    assert payload["session_started_at"] == started
    assert payload["exp"] == started + MAX_SESSION_SECONDS
    capped = await c.get("/api/auth/me", headers={"Authorization": f"Bearer {refreshed}"})
    assert "X-Octop-Access-Token" not in capped.headers
    r = await c.post(
        "/api/auth/change-password",
        headers={"Authorization": f"Bearer {refreshed}"},
        json={"old_password": "OldPass12", "new_password": "NewPass12"},
    )
    assert r.status_code == 204
    rotated = decode_token(secret, r.headers["X-Octop-Access-Token"])
    assert rotated["session_started_at"] == started
    assert rotated["exp"] == payload["exp"]
    # Factor-management replacements use the same origin, not another 72 hours.
    from octop.infra.auth.mfa import MfaService

    replacement, ttl = MfaService(srv.services, session_started_at=started).mint_access_token(user)
    assert 0 < ttl <= 120
    assert decode_token(secret, replacement)["exp"] == payload["exp"]


async def test_absolute_deadline_is_enforced_on_http(app_client):
    import time

    import jwt

    c, srv, home = app_client
    await bootstrap_admin(c, home, username="alice", password="TestPass12")
    user = srv.user_manager.get("alice")
    now = int(time.time())
    # A legacy JWT with a future exp cannot renew past its original 72h cap.
    token = jwt.encode(
        {"sub": str(user.id), "iat": now - MAX_SESSION_SECONDS, "exp": now + 3600},
        srv.services.secret_repo.get("jwt"),
        algorithm="HS256",
    )
    r = await c.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "TOKEN_EXPIRED"
    assert "X-Octop-Access-Token" not in r.headers
