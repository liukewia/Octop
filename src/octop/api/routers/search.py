"""API endpoints for AI web search provider connectivity testing."""

from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from octop.api.deps import current_admin
from octop.infra.errors import ErrorCode, OctopError

router = APIRouter(prefix="/search", tags=["search"])

# Provider id -> env var keys accepted for that provider. Requests may only
# set these specific keys (never arbitrary process env vars) to avoid
# unauthorized environment injection via this endpoint.
_PROVIDER_ENV_KEYS: dict[str, tuple[str, ...]] = {
    "tavily": ("TAVILY_API_KEY",),
    "brave": ("BRAVE_API_KEY",),
    "google": ("GOOGLE_API_KEY", "GOOGLE_CSE_ID"),
    "kimi": ("MOONSHOT_API_KEY",),
    "searchfree": (),
}

# Serializes env-var swap + probe so concurrent test requests never clobber
# each other's temporary os.environ mutation.
_test_lock = asyncio.Lock()


# ------------------------------------------------------------------
# Request / Response models
# ------------------------------------------------------------------


class TestSearchRequest(BaseModel):
    """Request to test a search provider."""

    env_vars: dict[str, str] = Field(
        default_factory=dict, description="Environment variables for the search provider"
    )


class TestSearchResponse(BaseModel):
    """Response from search provider test."""

    success: bool = Field(..., description="Whether the test was successful")
    provider_id: str = Field(..., description="Provider ID that was tested")
    response_time_ms: int = Field(..., description="Response time in milliseconds")
    result_count: int | None = Field(default=None, description="Number of results returned")
    message: str | None = Field(default=None, description="Success message")
    error: str | None = Field(default=None, description="Error message if failed")
    error_type: str | None = Field(
        default=None,
        description="Type of error (auth_error, timeout, network_error, invalid_config, unknown)",
    )


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------


@router.post(
    "/{provider_id}/test",
    response_model=TestSearchResponse,
    summary="Test search provider connectivity",
)
async def test_search_provider(
    provider_id: str,
    body: TestSearchRequest,
    _: Any = Depends(current_admin),
) -> TestSearchResponse:
    """Test connectivity and configuration of a search provider.

    Temporarily sets environment variables from the request and tests
    the corresponding search provider. Admin-only, since this mutates
    process environment variables (scoped to a known allowlist per provider).
    """
    allowed_keys = _PROVIDER_ENV_KEYS.get(provider_id)
    if allowed_keys is None:
        raise OctopError(ErrorCode.NOT_FOUND, f"unknown search provider: {provider_id!r}")

    unknown = sorted(set(body.env_vars) - set(allowed_keys))
    if unknown:
        raise OctopError(
            ErrorCode.SLASH_BAD_ARGS,
            f"unsupported env var(s) for provider {provider_id!r}: {unknown}",
        )

    async with _test_lock:
        start_time = time.time()

        # Save original env vars.
        original_env: dict[str, str | None] = {}
        for key in body.env_vars:
            original_env[key] = os.environ.get(key)

        try:
            # Set temporary env vars.
            for key, value in body.env_vars.items():
                os.environ[key] = value

            result = await _test_provider(provider_id)
            response_time_ms = int((time.time() - start_time) * 1000)

            if result["success"]:
                return TestSearchResponse(
                    success=True,
                    provider_id=provider_id,
                    response_time_ms=response_time_ms,
                    result_count=result.get("result_count"),
                    message=result.get("message"),
                )
            return TestSearchResponse(
                success=False,
                provider_id=provider_id,
                response_time_ms=response_time_ms,
                error=result.get("error"),
                error_type=result.get("error_type"),
            )
        except Exception as e:
            response_time_ms = int((time.time() - start_time) * 1000)
            return TestSearchResponse(
                success=False,
                provider_id=provider_id,
                response_time_ms=response_time_ms,
                error=str(e),
                error_type="unknown",
            )
        finally:
            # Restore original env vars.
            for key, original_value in original_env.items():
                if original_value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = original_value


async def _test_provider(provider_id: str) -> dict[str, Any]:
    """Test a specific search provider.

    Returns a dict with:
    - success: bool
    - result_count: int (if success)
    - message: str (if success)
    - error: str (if failed)
    - error_type: str
    """
    test_query = "test search"

    try:
        if provider_id == "tavily":
            return await _test_tavily(test_query)
        elif provider_id == "brave":
            return await _test_brave(test_query)
        elif provider_id == "google":
            return await _test_google(test_query)
        elif provider_id == "kimi":
            return await _test_kimi(test_query)
        elif provider_id == "searchfree":
            return await _test_searchfree(test_query)
        else:
            return {
                "success": False,
                "error": f"Unknown search provider: {provider_id}",
                "error_type": "invalid_config",
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": "unknown",
        }


async def _test_tavily(query: str) -> dict[str, Any]:
    """Test Tavily search provider."""
    api_key = os.getenv("TAVILY_API_KEY", "")
    if not api_key:
        return {
            "success": False,
            "error": "TAVILY_API_KEY environment variable is not set",
            "error_type": "invalid_config",
        }

    try:
        from langchain_tavily import TavilySearch

        search = TavilySearch(max_results=1, api_key=api_key)
        result = await search.ainvoke({"query": query})

        if isinstance(result, dict) and "results" in result:
            result_count = len(result.get("results", []))
        elif isinstance(result, str):
            try:
                parsed = json.loads(result)
                result_count = len(parsed.get("results", [])) if isinstance(parsed, dict) else 1
            except (json.JSONDecodeError, TypeError):
                result_count = 1
        else:
            result_count = 1

        return {
            "success": True,
            "result_count": result_count,
            "message": "Tavily search test successful",
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": "network_error" if "connection" in str(e).lower() else "auth_error",
        }


async def _test_brave(query: str) -> dict[str, Any]:
    """Test Brave search provider."""
    api_key = os.getenv("BRAVE_API_KEY", "")
    if not api_key:
        return {
            "success": False,
            "error": "BRAVE_API_KEY environment variable is not set",
            "error_type": "invalid_config",
        }

    try:
        from langchain_community.tools import BraveSearch

        search = BraveSearch.from_api_key(
            api_key=api_key,
            search_kwargs={"count": 1},
        )
        # BraveSearch only exposes a sync .run(); run it in a thread pool.
        result = await asyncio.get_event_loop().run_in_executor(None, search.run, query)

        try:
            parsed = json.loads(result) if isinstance(result, str) else result
            result_count = len(parsed.get("results", [])) if isinstance(parsed, dict) else 1
        except (json.JSONDecodeError, TypeError):
            result_count = 1

        return {
            "success": True,
            "result_count": result_count,
            "message": "Brave search test successful",
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": "network_error" if "connection" in str(e).lower() else "auth_error",
        }


async def _test_google(query: str) -> dict[str, Any]:
    """Test Google Custom Search provider."""
    api_key = os.getenv("GOOGLE_API_KEY", "")
    cse_id = os.getenv("GOOGLE_CSE_ID", "")

    if not api_key:
        return {
            "success": False,
            "error": "GOOGLE_API_KEY environment variable is not set",
            "error_type": "invalid_config",
        }
    if not cse_id:
        return {
            "success": False,
            "error": "GOOGLE_CSE_ID environment variable is not set",
            "error_type": "invalid_config",
        }

    try:
        from langchain_community.utilities.google_search import GoogleSearchAPIWrapper

        search = GoogleSearchAPIWrapper(
            google_api_key=api_key,
            google_cse_id=cse_id,
            k=1,
        )
        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda: search.results(query, num_results=1)
        )

        result_count = len(result) if result else 0

        return {
            "success": True,
            "result_count": result_count,
            "message": "Google search test successful",
        }
    except Exception as e:
        error_msg = str(e)
        if "quotaExceeded" in error_msg or "Invalid Credentials" in error_msg or "403" in error_msg:
            error_type = "auth_error"
        elif "connection" in error_msg.lower():
            error_type = "network_error"
        else:
            error_type = "unknown"

        return {
            "success": False,
            "error": error_msg,
            "error_type": error_type,
        }


async def _test_kimi(query: str) -> dict[str, Any]:
    """Test Kimi (Moonshot AI) search provider."""
    api_key = os.getenv("MOONSHOT_API_KEY", "")
    if not api_key:
        return {
            "success": False,
            "error": "MOONSHOT_API_KEY environment variable is not set",
            "error_type": "invalid_config",
        }

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.moonshot.cn/v1",
        )
        response = await client.chat.completions.create(
            model="moonshot-v1-128k",
            messages=[{"role": "user", "content": query}],
            tools=[{"type": "web_search"}],  # type: ignore[list-item]
            temperature=0.3,
        )

        message = response.choices[0].message
        result_count = 1 if message.content else 0

        return {
            "success": True,
            "result_count": result_count,
            "message": "Kimi search test successful",
        }
    except Exception as e:
        error_msg = str(e)
        if "invalid_api_key" in error_msg or "401" in error_msg:
            error_type = "auth_error"
        elif "connection" in error_msg.lower():
            error_type = "network_error"
        else:
            error_type = "unknown"

        return {
            "success": False,
            "error": error_msg,
            "error_type": error_type,
        }


async def _test_searchfree(query: str) -> dict[str, Any]:
    """Test SearchFree AI search provider (built-in, no API key required)."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://searchfree.site/api/search",
                json={
                    "query": query,
                    "search_depth": "advanced",
                    "max_results": 5,
                },
                timeout=30.0,
            )

            if response.status_code >= 400:
                return {
                    "success": False,
                    "error": f"API error: HTTP {response.status_code}",
                    "error_type": "network_error",
                }

            result = response.json()
            result_count = len(result.get("results", [])) if isinstance(result, dict) else 1

            return {
                "success": True,
                "result_count": result_count,
                "message": "SearchFree search test successful",
            }
    except Exception as e:
        error_msg = str(e)
        if "connection" in error_msg.lower() or "timeout" in error_msg.lower():
            error_type = "network_error"
        else:
            error_type = "unknown"

        return {
            "success": False,
            "error": error_msg,
            "error_type": error_type,
        }
