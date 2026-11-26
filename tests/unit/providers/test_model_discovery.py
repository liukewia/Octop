"""Mock-only protocol, version-cache and credential binding regressions."""

from __future__ import annotations

import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import httpx
import pytest

from octop.infra.agents.providers import model_discovery as discovery
from octop.infra.agents.providers.codex_apply import (
    apply_codex_credentials,
    complete_codex_login,
    sync_refreshed_codex_api_key,
)
from octop.infra.agents.providers.codex_oauth import CODEX_BASE_URL, save_codex_token
from octop.infra.agents.providers.probe import fetch_openai_compatible_models
from octop.infra.utils.paths import PathLayout


def response(payload, status=200):
    return httpx.Response(
        status, json=payload, request=httpx.Request("GET", "https://example.test")
    )


@pytest.fixture
def remote():
    client = AsyncMock()
    client.__aenter__.return_value = client
    with patch.object(discovery.httpx, "AsyncClient", return_value=client):
        yield client


@pytest.fixture
def version(monkeypatch):
    cache = discovery.CodexVersionCache("0.172.0", time.monotonic() + 3600)
    monkeypatch.setattr(discovery, "CODEX_VERSION_CACHE", cache)
    return cache


@pytest.mark.parametrize("provider_name", ["openai-codex", "custom-codex"])
async def test_codex_protocol_and_account_isolation(remote, version, provider_name):
    remote.get.return_value = response(
        {
            "models": [
                {"slug": " b ", "display_name": "Bee"},
                {"slug": "a"},
                {"slug": "a"},
                {"slug": ""},
                {"slug": 9},
                None,
                {},
            ]
        }
    )
    result = await fetch_openai_compatible_models(
        base_url=CODEX_BASE_URL + "/",
        api_key="mock-access",
        provider_name=provider_name,
        extra_headers={"ChatGPT-Account-Id": "mock-account", "user-agent": "old"},
    )
    assert result["ok"] is True
    assert [m["id"] for m in result["models"]] == ["a", "b"]
    assert all(m["api_mode"] == "responses" for m in result["models"])
    assert result["models"][1]["name"] == "Bee"
    args, kwargs = remote.get.await_args
    assert args[0] == CODEX_BASE_URL + "/models"
    assert kwargs["params"] == {"client_version": "0.172.0"}
    headers = kwargs["headers"]
    assert headers["authorization"] == "Bearer mock-access"
    assert headers["ChatGPT-Account-Id"] == "mock-account"
    assert headers["user-agent"] == "codex_cli_rs/0.172.0"
    assert headers["originator"] == "codex_cli_rs"
    # Catalogs, unlike client versions, are never shared across accounts.
    remote.get.return_value = response({"models": [{"slug": "other"}]})
    other = await fetch_openai_compatible_models(
        base_url=CODEX_BASE_URL,
        api_key="other-mock",
        extra_headers={"chatgpt-account-id": "other-account"},
    )
    assert [m["id"] for m in other["models"]] == ["other"]


async def test_codex_missing_account_fails_without_request(remote):
    result = await fetch_openai_compatible_models(
        base_url=CODEX_BASE_URL,
        api_key="mock",
        provider_name="openai-codex",
    )
    assert result["ok"] is False
    assert "account" in result["error"].lower()
    remote.get.assert_not_awaited()


@pytest.mark.parametrize("payload", [{"data": [{"id": "wrong"}]}, [], {"models": None}])
async def test_codex_rejects_wrong_envelope(remote, version, payload):
    remote.get.return_value = response(payload)
    result = await fetch_openai_compatible_models(
        base_url=CODEX_BASE_URL,
        api_key="mock",
        extra_headers={"chatgpt-account-id": "mock-account"},
    )
    assert result["ok"] is False
    assert "Codex" in result["error"]


@pytest.mark.parametrize("status", [302, 401, 403, 429, 500])
async def test_http_error_never_echoes_upstream_credentials(remote, version, status):
    remote.get.return_value = response({"error": "mock-secret mock-account"}, status)
    result = await fetch_openai_compatible_models(
        base_url=CODEX_BASE_URL,
        api_key="mock-secret",
        extra_headers={"chatgpt-account-id": "mock-account"},
    )
    assert result["ok"] is False
    assert "mock-secret" not in result["error"]
    assert "mock-account" not in result["error"]
    assert remote.get.await_count == 1


async def test_invalid_json(remote):
    remote.get.return_value = httpx.Response(200, text="mock-secret")
    result = await fetch_openai_compatible_models(base_url=None, api_key="mock-secret")
    assert result["ok"] is False
    assert "JSON" in result["error"]
    assert "mock-secret" not in result["error"]


@pytest.mark.parametrize(
    "base",
    ["file:///tmp/models", "https://mock:secret@example.test", "https://example.test?token=mock"],
)
async def test_invalid_url(remote, base):
    result = await fetch_openai_compatible_models(base_url=base, api_key="mock")
    assert result["ok"] is False
    remote.get.assert_not_awaited()


async def test_version_cache_ttl_and_header_separation(remote, monkeypatch):
    now = [100.0]
    monkeypatch.setattr(discovery.time, "monotonic", lambda: now[0])
    remote.get.return_value = response({"name": "0.172.0", "draft": False, "prerelease": False})
    cache = discovery.CodexVersionCache()
    assert await cache.get(remote) == "0.172.0"
    assert cache.expires_at == 3700.0
    now[0] = 3699
    assert await cache.get(remote) == "0.172.0"
    assert remote.get.await_count == 1
    headers = remote.get.await_args.kwargs["headers"]
    assert not {k.lower() for k in headers} & {"authorization", "chatgpt-account-id"}
    assert remote.get.await_args.kwargs["timeout"] == 5.0
    now[0] = 3701
    remote.get.return_value = response({"name": "0.173.0", "draft": False, "prerelease": False})
    assert await cache.get(remote) == "0.173.0"
    assert remote.get.await_count == 2


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "9.9.9", "prerelease": True},
        {"name": "9.9.9", "draft": True},
        {"name": "malicious\r\nheader"},
        {"name": "rust-v1.0.0"},
        [],
        {},
    ],
)
async def test_version_invalid_release_uses_verified_fallback(remote, payload):
    remote.get.return_value = response(payload)
    cache = discovery.CodexVersionCache()
    assert await cache.get(remote) == discovery.FALLBACK_CODEX_VERSION
    assert await cache.get(remote) == discovery.FALLBACK_CODEX_VERSION
    assert remote.get.await_count == 1


async def test_version_outage_keeps_last_good_version(remote):
    remote.get.side_effect = httpx.ConnectError("secret-url")
    cache = discovery.CodexVersionCache("0.171.0")
    assert await cache.get(remote) == "0.171.0"
    assert cache.expires_at > time.monotonic()


def test_refresh_syncs_account_and_preserves_options(tmp_path):
    paths = PathLayout(root=tmp_path)
    save_codex_token(
        paths,
        {
            "access": "new-mock",
            "refresh": "mock-refresh",
            "expires": 1,
            "account_id": "new-account",
        },
    )
    repo = Mock()
    repo.get_by_name.return_value = SimpleNamespace(
        id=7,
        extra_json=json.dumps(
            {"headers": {"ChatGPT-Account-Id": "old", "X-Custom": "keep"}, "option": True}
        ),
    )
    sync_refreshed_codex_api_key(SimpleNamespace(provider_repo=repo), paths, "new-mock")
    args, kwargs = repo.update.call_args
    assert args == (7,)
    assert kwargs["api_key"] == "new-mock"
    extra = json.loads(kwargs["extra_json"])
    assert extra == {
        "headers": {"chatgpt-account-id": "new-account", "X-Custom": "keep"},
        "option": True,
    }


@pytest.mark.parametrize("ok", [True, False])
async def test_login_persists_only_discovered_models(tmp_path, ok):
    paths = PathLayout(root=tmp_path)
    services = SimpleNamespace(provider_repo=Mock(), settings_repo=Mock())
    services.provider_repo.get_by_name.return_value = None
    services.provider_repo.create.return_value = 7
    cred = {"access": "mock", "refresh": "mock-refresh", "expires": 1, "account_id": "mock-account"}
    fetched = (
        {"ok": True, "models": [{"id": "account-model", "api_mode": "responses"}]}
        if ok
        else {"ok": False, "error": "HTTP 503"}
    )
    with patch(
        "octop.infra.agents.providers.codex_apply.fetch_openai_compatible_models",
        new=AsyncMock(return_value=fetched),
    ):
        pid, result = await complete_codex_login(services, paths, cred)
    assert pid == 7 and result == fetched
    models = json.loads(services.provider_repo.create.call_args.kwargs["models_json"])
    if ok:
        assert models == [{"id": "account-model", "api_mode": "responses", "enabled": True}]
        services.settings_repo.set_active_model.assert_called_once_with(
            "openai-codex", "account-model"
        )
    else:
        assert models == []
        services.settings_repo.set_active_model.assert_not_called()


def test_sync_binding_without_catalog_does_not_invent_models(tmp_path):
    services = SimpleNamespace(provider_repo=Mock(), settings_repo=Mock())
    services.provider_repo.get_by_name.return_value = None
    services.provider_repo.create.return_value = 1
    apply_codex_credentials(
        services,
        PathLayout(root=tmp_path),
        {"access": "mock", "refresh": "mock", "expires": 1, "account_id": "mock"},
    )
    assert json.loads(services.provider_repo.create.call_args.kwargs["models_json"]) == []
    services.settings_repo.set_active_model.assert_not_called()


def test_codex_template_does_not_advertise_static_account_models():
    from octop.infra.agents.providers.presets import load_provider_presets

    preset = next(p for p in load_provider_presets() if p["id"] == "openai-codex")
    assert preset["models"] == []


async def test_wire_headers_are_scoped_and_redirects_not_followed(monkeypatch):
    requests = []

    def handle(request):
        requests.append(request)
        if request.url.host == "api.github.com":
            assert "authorization" not in request.headers
            assert "chatgpt-account-id" not in request.headers
            return response({"name": "0.172.0", "draft": False, "prerelease": False})
        assert request.url.host == "chatgpt.com"
        assert request.url.params["client_version"] == "0.172.0"
        assert request.headers["authorization"] == "Bearer mock-secret"
        assert request.headers["chatgpt-account-id"] == "mock-account"
        return httpx.Response(302, headers={"Location": "https://evil.invalid/models"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handle), follow_redirects=False)
    monkeypatch.setattr(discovery, "CODEX_VERSION_CACHE", discovery.CodexVersionCache())
    with patch.object(discovery.httpx, "AsyncClient", return_value=client):
        result = await fetch_openai_compatible_models(
            base_url=CODEX_BASE_URL,
            api_key="mock-secret",
            extra_headers={"chatgpt-account-id": "mock-account"},
        )
    assert result["ok"] is False
    assert len(requests) == 2


async def test_version_cache_single_flight(remote):
    async def release(*args, **kwargs):
        await asyncio.sleep(0)
        return response({"name": "0.172.0", "draft": False, "prerelease": False})

    remote.get.side_effect = release
    cache = discovery.CodexVersionCache()
    assert await asyncio.gather(cache.get(remote), cache.get(remote)) == ["0.172.0", "0.172.0"]
    assert remote.get.await_count == 1
