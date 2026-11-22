"""Cloud-managed accounts running on a local installation."""

from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest

from octop.config import OctopConfig
from octop.infra.auth.cloud.claims import CloudIdentity
from octop.infra.auth.cloud.client import CloudAuthError, CloudClient
from octop.infra.auth.cloud.config import (
    CloudConfigError,
    load_config,
    normalize_base_url,
    save_config,
)
from octop.infra.auth.cloud.service import CloudAccountService, IssuedCloudSession
from octop.infra.auth.tokens import decode_token
from octop.infra.db.migrate import run_migrations
from octop.infra.db.pool import SqlitePool
from octop.infra.db.services import build_shared_services
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.users.identity import Role
from octop.infra.users.manager import UserManager
from octop.infra.utils.paths import PathLayout

ISSUER = "https://cloud.example.com"

Handler = Callable[[httpx.Request], httpx.Response]


@pytest.fixture
async def manager(tmp_path: Path) -> UserManager:
    paths = PathLayout(tmp_path / ".octop")
    paths.ensure_root()
    db = SqlitePool(paths.db)
    run_migrations(db)
    services = build_shared_services(db=db, paths=paths, config=OctopConfig())
    services.secret_repo.get_or_create("jwt", lambda: os.urandom(32))
    return UserManager(services)


def _configure(manager: UserManager, *, enabled: bool = True) -> None:
    save_config(
        manager._services,
        enabled=enabled,
        display_name="Octop Cloud",
        base_url=ISSUER,
        client_id="octop-desktop",
        client_secret="s3cret",
        allow_admin=True,
        auto_provision=True,
        sync_permissions=True,
        offline_grace_seconds=7 * 24 * 3600,
        request_timeout_seconds=5,
        signup_url="https://cloud.example.com/signup",
    )


def _service(manager: UserManager, handler: Handler) -> CloudAccountService:
    return CloudAccountService(
        manager._services,
        manager,
        client_factory=lambda cfg: CloudClient(cfg, transport=httpx.MockTransport(handler)),
    )


def _token_response(**overrides: object) -> dict[str, object]:
    user = {
        "sub": "u-1",
        "username": "alice",
        "name": "Alice Cloud",
        "email": "alice@corp.example",
        "role": "user",
        "permissions": ["experts", "unknown_permission"],
        "locale": "zh",
    }
    user.update(overrides.pop("user", {}))  # type: ignore[arg-type]
    body: dict[str, object] = {
        "access_token": "cloud-access",
        "refresh_token": "cloud-refresh",
        "token_type": "Bearer",
        "expires_in": 3600,
        "user": user,
    }
    body.update(overrides)
    return body


async def _login(service: CloudAccountService, username: str = "alice") -> IssuedCloudSession:
    issued = await service.login(
        username=username,
        password="pw",
        otp=None,
        mfa_token=None,
        client_ip="127.0.0.1",
    )
    assert isinstance(issued, IssuedCloudSession)
    return issued


# ----- configuration -------------------------------------------------------


def test_config_round_trip_keeps_secret_sealed(manager: UserManager) -> None:
    _configure(manager)
    cfg = load_config(manager._services)
    assert cfg is not None
    assert cfg.enabled is True
    assert cfg.base_url == ISSUER
    assert cfg.client_secret == "s3cret"
    assert cfg.signup_url == "https://cloud.example.com/signup"


def test_http_is_rejected_outside_loopback() -> None:
    with pytest.raises(CloudConfigError):
        normalize_base_url("http://cloud.example.com")
    assert normalize_base_url("http://127.0.0.1:8787/") == "http://127.0.0.1:8787"


def test_saving_without_secret_keeps_the_stored_one(manager: UserManager) -> None:
    _configure(manager)
    save_config(
        manager._services,
        enabled=True,
        display_name="Octop Cloud",
        base_url=ISSUER,
        client_id="octop-desktop",
        client_secret=None,
        allow_admin=True,
        auto_provision=True,
        sync_permissions=True,
        offline_grace_seconds=3600,
        request_timeout_seconds=5,
        signup_url=None,
    )
    cfg = load_config(manager._services)
    assert cfg is not None
    assert cfg.client_secret == "s3cret"
    assert cfg.offline_grace_seconds == 3600


# ----- protocol client -----------------------------------------------------


@pytest.mark.asyncio
async def test_password_login_returns_token_and_user(manager: UserManager) -> None:
    _configure(manager)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/auth/token"
        assert b'"grant_type":"password"' in request.content
        return httpx.Response(200, json=_token_response())

    client = CloudClient(
        load_config(manager._services),  # type: ignore[arg-type]
        transport=httpx.MockTransport(handler),
    )
    token = await client.password_login(username="alice", password="pw")
    assert token.access_token == "cloud-access"
    assert token.refresh_token == "cloud-refresh"
    assert token.expires_in == 3600
    assert token.user is not None and token.user["sub"] == "u-1"


@pytest.mark.asyncio
async def test_mfa_challenge_is_not_a_failure(manager: UserManager) -> None:
    _configure(manager)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={
                "error": "mfa_required",
                "mfa_required": True,
                "mfa_token": "challenge-1",
                "methods": ["totp", "recovery"],
            },
        )

    client = CloudClient(
        load_config(manager._services),  # type: ignore[arg-type]
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(CloudAuthError) as excinfo:
        await client.password_login(username="alice", password="pw")
    assert excinfo.value.reason == "mfa_required"
    assert excinfo.value.mfa_token == "challenge-1"
    assert excinfo.value.methods == ["totp", "recovery"]


@pytest.mark.asyncio
async def test_network_failure_maps_to_unavailable(manager: UserManager) -> None:
    _configure(manager)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom")

    client = CloudClient(
        load_config(manager._services),  # type: ignore[arg-type]
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(CloudAuthError) as excinfo:
        await client.password_login(username="alice", password="pw")
    assert excinfo.value.reason == "unavailable"


def test_cloud_identity_reads_roles_array() -> None:
    identity = CloudIdentity.from_user_document(
        {"sub": "u-9", "email": "bob@corp.example", "roles": ["member", "admin"]},
        fallback_username="bob",
    )
    assert identity.subject == "u-9"
    assert identity.username == "bob"
    assert identity.role == "admin"


def test_cloud_identity_requires_subject() -> None:
    with pytest.raises(CloudAuthError):
        CloudIdentity.from_user_document({"username": "alice"}, fallback_username="alice")


# ----- projection and sessions --------------------------------------------


@pytest.mark.asyncio
async def test_login_creates_a_cloud_projection_and_local_session(manager: UserManager) -> None:
    _configure(manager)
    issued = await _login(
        _service(manager, lambda request: httpx.Response(200, json=_token_response()))
    )

    row = manager._services.user_repo.get(issued.user.id)
    assert row is not None
    assert row.source == "cloud"
    assert row.cloud_subject == "u-1"
    assert row.cloud_issuer == ISSUER
    assert row.password_hash is None
    # Unknown cloud permission keys are dropped rather than stored.
    assert row.permissions == ["experts"]

    secret = manager._services.secret_repo.get("jwt")
    assert secret is not None
    payload = decode_token(secret, issued.access_token)
    assert payload["cs"] == issued.session_id
    session = manager._services.cloud_session_repo.get(issued.session_id)
    assert session is not None and session.is_active()


@pytest.mark.asyncio
async def test_second_login_reuses_the_same_row_and_syncs_role(manager: UserManager) -> None:
    _configure(manager)
    bodies = [
        _token_response(),
        _token_response(user={"role": "admin", "permissions": []}),
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=bodies.pop(0))

    service = _service(manager, handler)
    first = await _login(service)
    second = await _login(service)

    assert first.user.id == second.user.id
    row = manager._services.user_repo.get(first.user.id)
    assert row is not None and row.role == Role.ADMIN


@pytest.mark.asyncio
async def test_cloud_login_does_not_take_over_a_local_username(manager: UserManager) -> None:
    _configure(manager)
    await manager.create(username="alice", password="TestPass12", role=Role.USER)

    issued = await _login(
        _service(manager, lambda request: httpx.Response(200, json=_token_response()))
    )

    assert issued.user.username == "alice@cloud.example.com"
    assert manager._services.user_repo.count_by_source("local") == 1
    assert manager._services.user_repo.count_by_source("cloud") == 1


@pytest.mark.asyncio
async def test_cloud_projection_refuses_local_mutations(manager: UserManager) -> None:
    _configure(manager)
    issued = await _login(
        _service(manager, lambda request: httpx.Response(200, json=_token_response()))
    )

    with pytest.raises(OctopError) as excinfo:
        await manager.reset_password(issued.user.username, "NewPass123")
    assert excinfo.value.code is ErrorCode.CLOUD_MANAGED_ACCOUNT

    with pytest.raises(OctopError) as excinfo:
        await manager.set_role(issued.user.username, Role.ADMIN)
    assert excinfo.value.code is ErrorCode.CLOUD_MANAGED_ACCOUNT

    # A local password check must never succeed for a cloud projection.
    assert await manager.authenticate(issued.user.username, "NewPass123") is None


@pytest.mark.asyncio
async def test_mfa_challenge_does_not_create_a_user(manager: UserManager) -> None:
    _configure(manager)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={"error": "mfa_required", "mfa_token": "c1", "methods": ["totp"]},
        )

    outcome = await _service(manager, handler).login(
        username="alice",
        password="pw",
        otp=None,
        mfa_token=None,
        client_ip="127.0.0.1",
    )
    assert isinstance(outcome, dict) and outcome["mfa_required"] is True
    assert manager._services.user_repo.count_by_source("cloud") == 0


@pytest.mark.asyncio
async def test_refresh_rotates_the_local_token(manager: UserManager) -> None:
    _configure(manager)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_token_response())

    service = _service(manager, handler)
    issued = await _login(service)
    refreshed = await service.refresh(issued.access_token)

    assert refreshed.session_id == issued.session_id
    assert manager._services.cloud_session_repo.get(issued.session_id) is not None


@pytest.mark.asyncio
async def test_refresh_after_revocation_is_refused(manager: UserManager) -> None:
    _configure(manager)
    service = _service(manager, lambda request: httpx.Response(200, json=_token_response()))
    issued = await _login(service)

    manager._services.cloud_session_repo.revoke(issued.session_id)
    with pytest.raises(OctopError) as excinfo:
        await service.refresh(issued.access_token)
    assert excinfo.value.code is ErrorCode.CLOUD_ACCOUNT_SESSION_REVOKED


def test_disabled_service_reports_not_configured(manager: UserManager) -> None:
    _configure(manager, enabled=False)
    service = CloudAccountService(manager._services, manager)
    assert service.status()["enabled"] is False
    with pytest.raises(OctopError) as excinfo:
        service._require_config()
    assert excinfo.value.code is ErrorCode.CLOUD_ACCOUNT_NOT_CONFIGURED


# ----- self-service session management -------------------------------------


def _insert_sso_provider(manager: UserManager, *, kind: str = "oidc") -> int:
    with manager._services.db.transaction() as conn:
        cursor = conn.execute(
            "INSERT INTO sso_providers(enabled, kind, created_at, updated_at) VALUES (1, ?, 0, 0)",
            (kind,),
        )
        return int(cursor.lastrowid)


@pytest.mark.asyncio
async def test_own_sessions_only_show_my_devices(manager: UserManager) -> None:
    _configure(manager)

    def handler(request: httpx.Request) -> httpx.Response:
        if b"bob" in request.content:
            return httpx.Response(200, json=_token_response(user={"sub": "u-2", "username": "bob"}))
        return httpx.Response(200, json=_token_response())

    service = _service(manager, handler)
    mine = await _login(service)
    phone = await service.login(
        username="alice",
        password="pw",
        otp=None,
        mfa_token=None,
        client_ip="127.0.0.1",
        device_label="Pixel",
    )
    assert isinstance(phone, IssuedCloudSession)
    theirs = await _login(service, username="bob")

    rows = service.list_own_sessions(mine.user.id, current_session_id=phone.session_id)
    by_id = {row["session_id"]: row for row in rows}
    assert set(by_id) == {mine.session_id, phone.session_id}
    assert theirs.session_id not in by_id
    assert by_id[phone.session_id]["current"] is True
    assert by_id[mine.session_id]["current"] is False
    assert by_id[phone.session_id]["device_label"] == "Pixel"
    # Nothing that could be replayed leaves the backend.
    assert all("refresh_token_enc" not in row for row in rows)
    assert all("user_id" not in row for row in rows)


@pytest.mark.asyncio
async def test_revoking_a_foreign_session_is_a_miss(manager: UserManager) -> None:
    _configure(manager)

    def handler(request: httpx.Request) -> httpx.Response:
        if b"bob" in request.content:
            return httpx.Response(200, json=_token_response(user={"sub": "u-2", "username": "bob"}))
        return httpx.Response(200, json=_token_response())

    service = _service(manager, handler)
    mine = await _login(service)
    theirs = await _login(service, username="bob")

    assert await service.revoke_own_session(mine.user.id, theirs.session_id) is False
    stored = manager._services.cloud_session_repo.get(theirs.session_id)
    assert stored is not None and stored.is_active()

    assert await service.revoke_own_session(mine.user.id, mine.session_id) is True
    assert service.list_own_sessions(mine.user.id) == []


@pytest.mark.asyncio
async def test_revoke_other_sessions_keeps_the_current_device(manager: UserManager) -> None:
    _configure(manager)
    service = _service(manager, lambda request: httpx.Response(200, json=_token_response()))

    keep = await _login(service)
    await _login(service)
    await _login(service)

    revoked = await service.revoke_other_sessions(keep.user.id, keep_session_id=keep.session_id)
    assert revoked == 2
    active = [row["session_id"] for row in service.list_own_sessions(keep.user.id)]
    assert active == [keep.session_id]


@pytest.mark.asyncio
async def test_cloud_account_cannot_bind_a_local_sso_identity(manager: UserManager) -> None:
    """A second way in would sidestep the cloud's authentication entirely."""
    _configure(manager)
    service = _service(manager, lambda request: httpx.Response(200, json=_token_response()))
    issued = await _login(service)
    provider_id = _insert_sso_provider(manager)

    with pytest.raises(OctopError) as excinfo:
        await manager.bind_sso_identity(
            user_id=issued.user.id, provider_id=provider_id, subject="sub-1", claims={}
        )
    assert excinfo.value.code is ErrorCode.CLOUD_MANAGED_ACCOUNT
    provider = manager._services.sso_repo.get_by_kind("oidc")
    assert provider is not None
    assert manager._services.user_repo.get_by_sso(provider.id, "sub-1") is None
