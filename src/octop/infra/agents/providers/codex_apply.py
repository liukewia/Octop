"""Apply Codex OAuth credentials to the Octop provider store."""

from __future__ import annotations

import json
from typing import Any

from octop.infra.agents.providers.codex_oauth import (
    CODEX_BASE_URL,
    CodexOAuthCredentials,
    build_codex_headers,
    load_codex_token,
    save_codex_token,
)
from octop.infra.agents.providers.probe import fetch_openai_compatible_models
from octop.infra.utils.paths import PathLayout

CODEX_PROVIDER_NAME = "openai-codex"


def apply_codex_credentials(
    services: Any,
    paths: PathLayout,
    cred: CodexOAuthCredentials,
    *,
    set_active: bool = True,
    models: list[dict[str, Any]] | None = None,
) -> int:
    """Create or update the ``openai-codex`` provider row. Returns provider id."""
    save_codex_token(paths, cred)
    account_id = cred.get("account_id", "")
    extra_json = json.dumps({"headers": build_codex_headers(account_id)})
    # An OAuth login is not proof that a static model list is available.
    catalog = [{**model, "enabled": True} for model in (models or [])]
    models_json = json.dumps(catalog)
    row = services.provider_repo.get_by_name(CODEX_PROVIDER_NAME)
    if row is None:
        pid = services.provider_repo.create(
            name=CODEX_PROVIDER_NAME,
            kind="openai",
            base_url=CODEX_BASE_URL,
            api_key=cred["access"],
            extra_json=extra_json,
            models_json=models_json,
            note="ChatGPT OAuth (Codex)",
        )
    else:
        services.provider_repo.update(
            row.id,
            kind="openai",
            base_url=CODEX_BASE_URL,
            api_key=cred["access"],
            extra_json=extra_json,
            models_json=models_json,
            enabled=True,
        )
        pid = row.id
    if set_active and catalog:
        services.settings_repo.set_active_model(CODEX_PROVIDER_NAME, catalog[0]["id"])
    return int(pid)


def sync_refreshed_codex_api_key(services: Any, paths: PathLayout, access_token: str) -> None:
    row = services.provider_repo.get_by_name(CODEX_PROVIDER_NAME)
    if row is not None:
        extra = json.loads(row.extra_json) if row.extra_json else {}
        headers = extra.setdefault("headers", {})
        cred = load_codex_token(paths)
        if cred is not None and cred["access"] == access_token:
            # Account id can rotate with the access token. Keep unrelated options.
            headers = {k: v for k, v in headers.items() if k.lower() != "chatgpt-account-id"}
            if cred.get("account_id"):
                headers["chatgpt-account-id"] = cred["account_id"]
            extra["headers"] = headers
        services.provider_repo.update(row.id, api_key=access_token, extra_json=json.dumps(extra))


async def complete_codex_login(
    services: Any, paths: PathLayout, cred: CodexOAuthCredentials
) -> tuple[int, dict[str, Any]]:
    """Bind OAuth even if discovery is temporarily unavailable; never invent models."""
    result = await fetch_openai_compatible_models(
        base_url=CODEX_BASE_URL,
        api_key=cred["access"],
        provider_name=CODEX_PROVIDER_NAME,
        extra_headers=build_codex_headers(cred.get("account_id", "")),
    )
    pid = apply_codex_credentials(services, paths, cred, models=result.get("models", []))
    return pid, result
