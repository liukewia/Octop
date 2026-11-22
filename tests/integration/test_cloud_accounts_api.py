"""Cloud-managed accounts through the public API.

The cloud service is faked at the client seam: these tests exercise the local
contract (config, sign-in, projection, read-only enforcement, revocation)
without a network dependency.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from octop.infra.auth.cloud import service as cloud_service
from octop.infra.auth.cloud.client import CloudAuthError, CloudToken
from tests.support.auth import bearer

CLOUD_USER = {
    "sub": "u-1",
    "username": "alice",
    "name": "Alice Cloud",
    "email": "alice@corp.example",
    "role": "user",
    "permissions": ["experts"],
    "locale": "zh",
}


class FakeCloudClient:
    def __init__(self, config: Any) -> None:
        self.config = config

    async def password_login(
        self,
        *,
        username: str,
        password: str,
        otp: str | None = None,
        mfa_token: str | None = None,
    ) -> CloudToken:
        if password == "mfa":
            raise CloudAuthError(
                "mfa_required",
                "second factor required",
                mfa_token="challenge-1",
                methods=["totp"],
            )
        if password != "pw":
            raise CloudAuthError("invalid_credentials")
        return CloudToken(
            access_token="cloud-access",
            refresh_token="cloud-refresh",
            expires_in=3600,
            user=CLOUD_USER,
        )

    async def refresh(self, refresh_token: str) -> CloudToken:
        return CloudToken(
            access_token="cloud-access-2",
            refresh_token="cloud-refresh-2",
            expires_in=3600,
            user=CLOUD_USER,
        )

    async def revoke(self, token: str) -> None:
        return None

    async def probe(self) -> dict[str, Any]:
        return {"service": "octop-cloud", "version": "1.0.0"}


CONFIG_BODY = {
    "enabled": True,
    "display_name": "Octop Cloud",
    "base_url": "https://cloud.example.com",
    "client_id": "octop-desktop",
    "client_secret": "s3cret",
    "allow_admin": True,
    "auto_provision": True,
    "sync_permissions": True,
    "offline_grace_seconds": 7 * 24 * 3600,
    "request_timeout_seconds": 5,
    "signup_url": "https://cloud.example.com/signup",
}


@pytest.fixture(autouse=True)
def _fake_cloud(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cloud_service, "CloudClient", FakeCloudClient)


async def test_cloud_sign_in_end_to_end(env: Any) -> None:
    client, _srv, auth = env

    # Disabled by default: the login page has no cloud entry.
    status = await client.get("/api/auth/cloud/status")
    assert status.status_code == 200
    assert status.json()["enabled"] is False

    # An ordinary member cannot configure the account source.
    forbidden = await client.put(
        "/api/admin/cloud-account",
        json=CONFIG_BODY,
        headers=bearer(await _member_token(client, auth)),
    )
    assert forbidden.status_code == 403

    saved = await client.put("/api/admin/cloud-account", json=CONFIG_BODY, headers=auth)
    assert saved.status_code == 200
    assert saved.json()["has_secret"] is True
    assert "client_secret" not in saved.json()

    status = await client.get("/api/auth/cloud/status")
    assert status.json()["enabled"] is True
    assert status.json()["display_name"] == "Octop Cloud"

    # Wrong password never creates a projection.
    bad = await client.post("/api/auth/cloud/login", json={"username": "alice", "password": "nope"})
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "AUTH_FAILED"

    signed_in = await client.post(
        "/api/auth/cloud/login", json={"username": "alice", "password": "pw"}
    )
    assert signed_in.status_code == 200
    body = signed_in.json()
    assert body["cloud"] is True
    assert body["user"]["account_source"] == "cloud"
    assert body["user"]["cloud_managed"] is True
    cloud_auth = bearer(body["access_token"])

    me = await client.get("/api/auth/me", headers=cloud_auth)
    assert me.status_code == 200
    assert me.json()["username"] == "alice"
    assert me.json()["has_password"] is False

    listed = await client.get("/api/users", headers=auth)
    assert listed.status_code == 200
    cloud_row = next(row for row in listed.json() if row["username"] == "alice")
    assert cloud_row["source"] == "cloud"
    assert cloud_row["cloud_managed"] is True
    assert cloud_row["cloud_issuer"] == "https://cloud.example.com"

    # The cloud owns the role: a local edit is refused, not silently ignored.
    patch = await client.patch(
        f"/api/users/{cloud_row['id']}", json={"role": "admin"}, headers=auth
    )
    assert patch.status_code == 409
    assert patch.json()["error"]["code"] == "CLOUD_MANAGED_ACCOUNT"

    reset = await client.post(
        f"/api/users/{cloud_row['id']}/reset-password",
        json={"new_password": "TestPass99"},
        headers=auth,
    )
    assert reset.status_code == 409

    # Force offline: the next request with the old local token fails.
    revoked = await client.delete(
        f"/api/admin/cloud-account/sessions/{cloud_row['id']}", headers=auth
    )
    assert revoked.status_code == 200
    assert revoked.json()["revoked"] == 1

    dead = await client.get("/api/auth/me", headers=cloud_auth)
    assert dead.status_code == 401
    assert dead.json()["error"]["code"] == "CLOUD_ACCOUNT_SESSION_REVOKED"

    refresh = await client.post(
        "/api/auth/cloud/refresh", json={"access_token": body["access_token"]}
    )
    assert refresh.status_code == 401

    # The local admin is unaffected throughout.
    assert (await client.get("/api/auth/me", headers=auth)).status_code == 200


async def test_cloud_mfa_challenge_is_forwarded(env: Any) -> None:
    client, _srv, auth = env
    await client.put("/api/admin/cloud-account", json=CONFIG_BODY, headers=auth)

    challenge = await client.post(
        "/api/auth/cloud/login", json={"username": "alice", "password": "mfa"}
    )
    assert challenge.status_code == 200
    payload = challenge.json()
    assert payload["mfa_required"] is True
    assert payload["mfa_token"] == "challenge-1"
    assert payload["methods"] == ["totp"]

    # No local account exists until the cloud actually authenticates.
    listed = await client.get("/api/users", headers=auth)
    assert all(row["username"] != "alice" for row in listed.json())


async def test_probe_reports_the_cloud_service(env: Any) -> None:
    client, _srv, auth = env
    await client.put("/api/admin/cloud-account", json=CONFIG_BODY, headers=auth)

    probe = await client.post("/api/admin/cloud-account/test", headers=auth)
    assert probe.status_code == 200
    assert probe.json()["service"] == "octop-cloud"


async def test_self_service_session_management(env: Any) -> None:
    """A cloud account can see and drop its own devices, and only its own."""
    client, _srv, auth = env
    await client.put("/api/admin/cloud-account", json=CONFIG_BODY, headers=auth)

    laptop = await client.post(
        "/api/auth/cloud/login",
        json={"username": "alice", "password": "pw", "device_label": "MacBook"},
    )
    phone = await client.post(
        "/api/auth/cloud/login",
        json={"username": "alice", "password": "pw", "device_label": "Pixel"},
    )
    laptop_auth = bearer(laptop.json()["access_token"])
    phone_auth = bearer(phone.json()["access_token"])

    # Signed out: no device list for anonymous callers. (The shared client
    # keeps cookies from the sign-in above, so use a credential-free one.)
    anon = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=client._octop_app),  # type: ignore[attr-defined]
        base_url="http://testserver",
    )
    async with anon:
        assert (await anon.get("/api/auth/cloud/sessions")).status_code == 401

    listing = await client.get("/api/auth/cloud/sessions", headers=laptop_auth)
    assert listing.status_code == 200
    sessions = listing.json()["sessions"]
    assert {row["device_label"] for row in sessions} == {"MacBook", "Pixel"}
    current = [row for row in sessions if row["current"]]
    assert [row["session_id"] for row in current] == [laptop.json()["cloud_session_id"]]
    assert all("refresh_token_enc" not in row for row in sessions)

    dropped = await client.delete(
        f"/api/auth/cloud/sessions/{phone.json()['cloud_session_id']}", headers=laptop_auth
    )
    assert dropped.status_code == 204
    dead = await client.get("/api/auth/me", headers=phone_auth)
    assert dead.status_code == 401
    assert dead.json()["error"]["code"] == "CLOUD_ACCOUNT_SESSION_REVOKED"

    # An unknown id is a miss, not a silent success.
    missing = await client.delete("/api/auth/cloud/sessions/nope", headers=laptop_auth)
    assert missing.status_code == 404

    third = await client.post("/api/auth/cloud/login", json={"username": "alice", "password": "pw"})
    assert third.status_code == 200
    others = await client.delete("/api/auth/cloud/sessions", headers=laptop_auth)
    assert others.status_code == 200
    assert others.json()["revoked"] == 1
    assert (await client.get("/api/auth/me", headers=laptop_auth)).status_code == 200
    third_auth = bearer(third.json()["access_token"])
    assert (await client.get("/api/auth/me", headers=third_auth)).status_code == 401


async def _member_token(client: Any, auth: dict[str, str]) -> str:
    """Create a plain member and sign in as them."""
    import secrets

    username = f"member{secrets.token_hex(3)}"
    created = await client.post(
        "/api/users",
        json={"username": username, "password": "TestPass12", "role": "user"},
        headers=auth,
    )
    assert created.status_code == 201
    login = await client.post(
        "/api/auth/login", json={"username": username, "password": "TestPass12"}
    )
    login.raise_for_status()
    return login.json()["access_token"]
