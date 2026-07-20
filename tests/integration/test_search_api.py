"""Integration tests for /api/search/{provider_id}/test."""

from __future__ import annotations

import os
from typing import Any


async def test_search_unknown_provider(env: Any) -> None:
    c, _srv, auth = env
    r = await c.post("/api/search/nope/test", headers=auth, json={"env_vars": {}})
    assert r.status_code == 404


async def test_search_tavily_missing_key(env: Any, monkeypatch: Any) -> None:
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    c, _srv, auth = env
    r = await c.post("/api/search/tavily/test", headers=auth, json={"env_vars": {}})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is False
    assert body["provider_id"] == "tavily"
    assert body["error_type"] == "invalid_config"


async def test_search_rejects_unlisted_env_var(env: Any) -> None:
    c, _srv, auth = env
    r = await c.post(
        "/api/search/tavily/test",
        headers=auth,
        json={"env_vars": {"TAVILY_API_KEY": "tvly-1", "SOME_OTHER_KEY": "x"}},
    )
    assert r.status_code == 400


async def test_search_env_vars_restored_after_test(env: Any, monkeypatch: Any) -> None:
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    c, _srv, auth = env
    assert "TAVILY_API_KEY" not in os.environ
    await c.post(
        "/api/search/tavily/test",
        headers=auth,
        json={"env_vars": {"TAVILY_API_KEY": "tvly-bogus"}},
    )
    assert "TAVILY_API_KEY" not in os.environ


async def test_search_non_admin_forbidden(env: Any) -> None:
    c, _srv, admin_auth = env
    await c.post(
        "/api/users",
        headers=admin_auth,
        json={"username": "bob-search", "password": "pw", "role": "user"},
    )
    bob_tok = (
        await c.post("/api/auth/login", json={"username": "bob-search", "password": "pw"})
    ).json()["access_token"]
    r = await c.post(
        "/api/search/tavily/test",
        headers={"Authorization": f"Bearer {bob_tok}"},
        json={"env_vars": {}},
    )
    assert r.status_code == 403
