"""Integration tests for admin provider fetch-models endpoint."""

from __future__ import annotations

import json
import time
from typing import Any
from unittest.mock import AsyncMock, patch

from octop.infra.agents.providers.codex_oauth import CODEX_BASE_URL, save_codex_token


async def test_admin_fetch_models_requires_api_key(env: Any) -> None:
    client, _srv, auth = env
    r = await client.post(
        "/api/admin/providers/fetch-models",
        headers=auth,
        json={
            "kind": "openai",
            "api_key": "",
            "base_url": "https://api.example.com/v1",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert "api_key" in body["error"]


async def test_admin_fetch_models_rejects_non_openai_kind(env: Any) -> None:
    client, _srv, auth = env
    r = await client.post(
        "/api/admin/providers/fetch-models",
        headers=auth,
        json={
            "kind": "anthropic",
            "api_key": "sk-test",
            "base_url": "https://api.anthropic.com",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert "openai" in body["error"].lower()


async def test_admin_fetch_models_success(env: Any) -> None:
    client, _srv, auth = env
    fake = {
        "ok": True,
        "models": [{"id": "gpt-4o", "name": "gpt-4o"}],
    }
    with patch(
        "octop.api.routers.providers.fetch_openai_compatible_models",
        new=AsyncMock(return_value=fake),
    ) as mocked:
        r = await client.post(
            "/api/admin/providers/fetch-models",
            headers=auth,
            json={
                "kind": "openai",
                "api_key": "sk-test",
                "base_url": "https://api.example.com/v1",
            },
        )
    assert r.status_code == 200, r.text
    assert r.json() == fake
    mocked.assert_awaited_once()
    kwargs = mocked.await_args.kwargs
    assert kwargs["api_key"] == "sk-test"
    assert kwargs["base_url"] == "https://api.example.com/v1"
    assert kwargs["provider_name"] is None


async def test_admin_fetch_models_uses_stored_key(env: Any) -> None:
    client, _srv, auth = env
    created = await client.post(
        "/api/admin/providers",
        headers=auth,
        json={
            "name": "stored-openai",
            "kind": "openai",
            "api_key": "sk-stored",
            "base_url": "https://api.example.com/v1",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["api_key"] is None
    provider_id = created.json()["id"]
    fake = {"ok": True, "models": [{"id": "gpt-4o", "name": "gpt-4o"}]}
    with patch(
        "octop.api.routers.providers.fetch_openai_compatible_models",
        new=AsyncMock(return_value=fake),
    ) as mocked:
        response = await client.post(
            "/api/admin/providers/fetch-models",
            headers=auth,
            json={
                "kind": "openai",
                "provider_id": provider_id,
                "base_url": "https://api.example.com/v1",
            },
        )
    assert response.status_code == 200, response.text
    assert "sk-stored" not in response.text
    assert mocked.await_args.kwargs["api_key"] == "sk-stored"


async def test_bound_codex_fetch_refreshes_key_and_account(env: Any) -> None:
    client, srv, auth = env
    pid = srv.services.provider_repo.create(
        name="openai-codex",
        kind="openai",
        base_url=CODEX_BASE_URL,
        api_key="old-mock",
        extra_json=json.dumps({"headers": {"chatgpt-account-id": "old-account"}}),
    )
    save_codex_token(
        srv.services.paths,
        {
            "access": "new-mock",
            "refresh": "mock-refresh",
            "expires": int(time.time() * 1000) + 3600000,
            "account_id": "new-account",
        },
    )
    fake = {"ok": True, "models": [{"id": "account-model", "name": "Account model"}]}
    with patch(
        "octop.api.routers.providers.fetch_openai_compatible_models",
        new=AsyncMock(return_value=fake),
    ) as mocked:
        r = await client.post(
            "/api/admin/providers/fetch-models",
            headers=auth,
            json={
                "kind": "openai",
                "provider_id": pid,
                "extra_json": json.dumps(
                    {"headers": {"ChatGPT-Account-Id": "stale-editor", "X-Custom": "keep"}}
                ),
            },
        )
    assert r.status_code == 200 and r.json() == fake
    assert "new-mock" not in r.text
    kwargs = mocked.await_args.kwargs
    assert kwargs["api_key"] == "new-mock"
    assert kwargs["provider_name"] == "openai-codex"
    assert kwargs["base_url"] == CODEX_BASE_URL
    assert kwargs["extra_headers"] == {"chatgpt-account-id": "new-account", "X-Custom": "keep"}
    row = srv.services.provider_repo.get(pid)
    assert row.api_key == "new-mock"
    assert json.loads(row.extra_json)["headers"]["chatgpt-account-id"] == "new-account"


async def test_bound_codex_credentials_cannot_target_draft_host(env: Any) -> None:
    client, srv, auth = env
    pid = srv.services.provider_repo.create(
        name="openai-codex",
        kind="openai",
        base_url=CODEX_BASE_URL,
        api_key="mock-secret",
    )
    with patch("octop.api.routers.providers.get_valid_access_token") as token:
        r = await client.post(
            "/api/admin/providers/fetch-models",
            headers=auth,
            json={
                "kind": "openai",
                "provider_id": pid,
                "api_key": " ",
                "base_url": "https://example.test/chatgpt.com/backend-api/codex",
            },
        )
    assert r.status_code == 200
    assert r.json()["ok"] is False
    assert "mock-secret" not in r.text
    token.assert_not_called()


async def test_custom_codex_row_does_not_use_global_oauth(env: Any) -> None:
    client, srv, auth = env
    pid = srv.services.provider_repo.create(
        name="custom-codex",
        kind="openai",
        base_url=CODEX_BASE_URL,
        api_key="custom-mock",
        extra_json=json.dumps({"headers": {"chatgpt-account-id": "custom-account"}}),
    )
    with (
        patch("octop.api.routers.providers.get_valid_access_token") as token,
        patch(
            "octop.api.routers.providers.fetch_openai_compatible_models",
            new=AsyncMock(return_value={"ok": True, "models": []}),
        ) as mocked,
    ):
        r = await client.post(
            "/api/admin/providers/fetch-models",
            headers=auth,
            json={
                "kind": "openai",
                "provider_id": pid,
            },
        )
    assert r.json() == {"ok": True, "models": []}
    token.assert_not_called()
    assert mocked.await_args.kwargs["api_key"] == "custom-mock"
