"""Provider-specific model discovery, independent of HTTP routers and chat probes.

Adapters are ordered from specific to generic. No account catalog is cached.
"""

from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass, field
from typing import Any, Protocol
from urllib.parse import urlsplit

import httpx

from octop.infra.agents.providers.codex_oauth import CODEX_BASE_URL
from octop.infra.agents.providers.headers import assemble_provider_headers
from octop.infra.agents.providers.magpie import is_magpie_provider, magpie_catalog_model

RELEASE_URL = "https://api.github.com/repos/openai/codex/releases/latest"
# Verified stable release; used only when GitHub is unavailable on cold start.
# https://github.com/openai/codex/releases/tag/rust-v0.172.0
FALLBACK_CODEX_VERSION = "0.172.0"
_VERSION_RE = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+")


class ModelDiscoveryError(ValueError):
    """A credential-free error suitable for returning to the caller."""


@dataclass
class CodexVersionCache:
    version: str = ""
    expires_at: float = 0
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    async def get(self, client: httpx.AsyncClient) -> str:
        # One release lookup per process at a time, even on cold concurrent fetches.
        async with self._lock:
            return await self._get(client)

    async def _get(self, client: httpx.AsyncClient) -> str:
        now = time.monotonic()
        if now < self.expires_at:
            return self.version or FALLBACK_CODEX_VERSION
        try:
            # Never send provider headers to GitHub; separate timeout budget.
            response = await client.get(
                RELEASE_URL,
                headers={"Accept": "application/vnd.github+json", "User-Agent": "Octop"},
                timeout=5.0,
            )
            response.raise_for_status()
            release = response.json()
            version = release.get("name", "")
            if (
                release.get("draft")
                or release.get("prerelease")
                or not isinstance(version, str)
                or not _VERSION_RE.fullmatch(version.strip())
            ):
                raise ValueError("invalid stable release")
            self.version = version.strip()
            self.expires_at = now + 3600
        except (httpx.HTTPError, ValueError, AttributeError):
            # Last good version, or briefly negative-cache cold failures.
            self.expires_at = now + 60
        return self.version or FALLBACK_CODEX_VERSION


CODEX_VERSION_CACHE = CodexVersionCache()


def is_codex_endpoint(base_url: str | None) -> bool:
    """Exact official endpoint match, not a substring check."""
    return (base_url or "").strip().rstrip("/") == CODEX_BASE_URL


@dataclass(frozen=True)
class ModelDiscoveryContext:
    base_url: str | None
    api_key: str = field(repr=False)
    provider_name: str | None = None
    extra: dict[str, Any] = field(default_factory=dict, repr=False)
    extra_headers: dict[str, str] = field(default_factory=dict, repr=False)
    presets: list[dict[str, Any]] = field(default_factory=list)

    @property
    def root(self) -> str:
        return (self.base_url or "").strip().rstrip("/") or "https://api.openai.com/v1"


def normalize_models(models: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Preserve adapter metadata while trimming, deduplicating and sorting IDs."""
    by_id: dict[str, dict[str, Any]] = {}
    for model in models:
        raw = model.get("id")
        if not isinstance(raw, str) or not raw.strip():
            continue
        mid = raw.strip()
        name = model.get("name")
        display_name = name.strip() if isinstance(name, str) and name.strip() else mid
        by_id.setdefault(mid, {**model, "id": mid, "name": display_name})
    return [by_id[mid] for mid in sorted(by_id)]


class ModelDiscoveryAdapter(Protocol):
    def matches(self, context: ModelDiscoveryContext) -> bool: ...

    async def fetch(self, context: ModelDiscoveryContext) -> list[dict[str, Any]]: ...


class StaticCatalogAdapter:
    _PRESETS = frozenset(
        {
            "tencent-coding-plan",
            "tencent-token-plan",
            "tencent-token-plan-enterprise-cn",
            "tencent-hy-token-plan",
        }
    )

    def catalog(self, context: ModelDiscoveryContext) -> list[dict[str, Any]] | None:
        for preset in context.presets:
            if (
                preset["id"] in self._PRESETS
                and context.provider_name in {preset["id"], preset["name"]}
                and context.root == (preset.get("base_url") or "").rstrip("/")
            ):
                return list(preset["models"])
        return None

    def matches(self, context: ModelDiscoveryContext) -> bool:
        return self.catalog(context) is not None

    async def fetch(self, context: ModelDiscoveryContext) -> list[dict[str, Any]]:
        return self.catalog(context) or []


class OpenAIModelAdapter:
    def matches(self, context: ModelDiscoveryContext) -> bool:
        return True

    async def request(
        self, context: ModelDiscoveryContext, client: httpx.AsyncClient
    ) -> httpx.Response:
        magpie = is_magpie_provider(
            provider_name=context.provider_name, base_url=context.base_url, extra=context.extra
        )
        headers = {"Authorization": f"Bearer {context.api_key}"}
        headers.update(
            assemble_provider_headers(
                context.provider_name,
                context.extra_headers,
                base_url=context.base_url,
                extra=context.extra,
                probe=not magpie,
            )
            or {}
        )
        return await client.get(f"{context.root}/models", headers=headers)

    def parse(self, payload: Any) -> list[dict[str, Any]]:
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            raise ModelDiscoveryError("response is not OpenAI-compatible (expected data[].id)")
        return [{"id": item.get("id")} for item in data if isinstance(item, dict)]

    async def fetch(self, context: ModelDiscoveryContext) -> list[dict[str, Any]]:
        try:
            target = urlsplit(context.root)
        except ValueError:
            raise ModelDiscoveryError("invalid model discovery base URL") from None
        if (
            target.scheme not in {"http", "https"}
            or not target.hostname
            or target.username
            or target.password
            or target.query
            or target.fragment
        ):
            raise ModelDiscoveryError("invalid model discovery base URL")
        try:
            # httpx does not follow redirects by default: don't forward secrets.
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
                response = await self.request(context, client)
            if not 200 <= response.status_code < 300:
                # Upstream bodies may echo credentials; do not return/log them.
                raise ModelDiscoveryError(f"HTTP {response.status_code}")
            try:
                payload = response.json()
            except ValueError:
                raise ModelDiscoveryError("model discovery response is not valid JSON") from None
            return self.parse(payload)
        except httpx.InvalidURL:
            raise ModelDiscoveryError("invalid model discovery base URL") from None
        except httpx.TimeoutException:
            raise ModelDiscoveryError("model discovery connection timed out") from None
        except httpx.RequestError:
            raise ModelDiscoveryError("model discovery connection failed") from None


class MagpieModelAdapter(OpenAIModelAdapter):
    def matches(self, context: ModelDiscoveryContext) -> bool:
        return is_magpie_provider(
            provider_name=context.provider_name, base_url=context.base_url, extra=context.extra
        )

    def parse(self, payload: Any) -> list[dict[str, Any]]:
        super().parse(payload)
        return [
            mapped
            for item in payload["data"]
            if isinstance(item, dict)
            if (mapped := magpie_catalog_model(item)) is not None
        ]


class CodexModelAdapter(OpenAIModelAdapter):
    def matches(self, context: ModelDiscoveryContext) -> bool:
        return context.provider_name == "openai-codex" or is_codex_endpoint(context.base_url)

    async def request(
        self, context: ModelDiscoveryContext, client: httpx.AsyncClient
    ) -> httpx.Response:
        account_id = next(
            (
                value.strip()
                for key, value in context.extra_headers.items()
                if key.lower() == "chatgpt-account-id"
            ),
            "",
        )
        if not account_id:
            raise ModelDiscoveryError("Codex account id is required; reconnect ChatGPT OAuth")
        version = await CODEX_VERSION_CACHE.get(client)
        headers = httpx.Headers(context.extra_headers)
        headers.update(
            {
                "Authorization": f"Bearer {context.api_key}",
                "ChatGPT-Account-Id": account_id,
                "User-Agent": f"codex_cli_rs/{version}",
                "originator": "codex_cli_rs",
                "version": version,
                "Accept": "application/json",
            }
        )
        root = context.root if context.base_url else CODEX_BASE_URL
        return await client.get(
            f"{root}/models", params={"client_version": version}, headers=headers
        )

    def parse(self, payload: Any) -> list[dict[str, Any]]:
        data = payload.get("models") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            raise ModelDiscoveryError("response is not a Codex catalog (expected models[].slug)")
        return [
            {
                "id": item.get("slug"),
                "name": item.get("display_name") or item.get("slug"),
                "api_mode": "responses",
                "api_fallback": "none",
            }
            for item in data
            if isinstance(item, dict)
        ]


# Specific adapters precede the OpenAI-compatible fallback. No OAuth catalog
# silently falls back to a static list of supposedly available models.
MODEL_DISCOVERY_ADAPTERS: tuple[ModelDiscoveryAdapter, ...] = (
    CodexModelAdapter(),
    StaticCatalogAdapter(),
    MagpieModelAdapter(),
    OpenAIModelAdapter(),
)


async def discover_provider_models(context: ModelDiscoveryContext) -> list[dict[str, Any]]:
    for adapter in MODEL_DISCOVERY_ADAPTERS:
        if adapter.matches(context):
            return normalize_models(await adapter.fetch(context))
    raise ModelDiscoveryError("no model discovery adapter")
