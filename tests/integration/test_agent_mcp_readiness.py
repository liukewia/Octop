"""External MCP client readiness, grants, and caller isolation (no live LLM)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from octop.api.deps import ACCESS_TOKEN_RESPONSE_HEADER
from octop.infra.auth.tokens import PURPOSE_ACCESS, sign_token
from octop.infra.users.groups import RESOURCE_EXPERT, GroupAccess
from tests.support.auth import create_user, resolve_user_id


async def _tool(
    client: httpx.AsyncClient,
    auth: dict[str, str],
    name: str,
    **arguments: Any,
) -> dict[str, Any]:
    response = await client.post(
        "/api/mcp/agents",
        headers=auth,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        },
    )
    assert response.status_code == 200
    return response.json()["result"]


@pytest.mark.asyncio
async def test_agent_mcp_sdk_roundtrip(
    env_with_agent: tuple[httpx.AsyncClient, Any, dict[str, str], str],
) -> None:
    """Exercise the actual SDK transport and typed result validation, not just raw JSON."""
    client, server, auth, agent_id = env_with_agent
    runtime_agent = server.app_runtime.agent_registry.get_agent(agent_id)
    runtime_agent.chunks = [{"type": "token", "content": "knowledge answer"}]
    client.headers.update(auth)
    async with asyncio.timeout(30):
        async with streamable_http_client(
            str(client.base_url.join("/api/mcp/agents")), http_client=client
        ) as (read, write, get_session_id):
            async with ClientSession(read, write) as session:
                initialized = await session.initialize()
                assert initialized.serverInfo.name == "octop-agent-mcp-gateway"
                assert get_session_id()
                tools = await session.list_tools()
                assert {tool.name for tool in tools.tools} == {
                    "list_octop_experts",
                    "call_octop_expert",
                    "resume_octop_expert",
                }
                experts = await session.call_tool("list_octop_experts", {})
                assert not experts.isError
                assert any(
                    expert["expert_id"] == agent_id
                    for expert in experts.structuredContent["experts"]
                )
                result = await session.call_tool(
                    "call_octop_expert", {"expert_id": agent_id, "message": "question"}
                )
                assert not result.isError
                assert result.structuredContent["status"] == "completed"
                assert result.structuredContent["response"] == "knowledge answer"
                await session.send_ping()


@pytest.mark.asyncio
@pytest.mark.parametrize("tool", ["call_octop_expert", "resume_octop_expert"])
async def test_shared_expert_does_not_share_mcp_threads(
    env_with_agent: tuple[httpx.AsyncClient, Any, dict[str, str], str],
    tool: str,
) -> None:
    client, server, admin, agent_id = env_with_agent
    alice = await create_user(client, admin, username="alice")
    bob = await create_user(client, admin, username="bob")
    server.services.agent_repo.set_shared(agent_id, True)
    runtime_agent = server.app_runtime.agent_registry.get_agent(agent_id)
    runtime_agent.chunks = [{"type": "token", "content": "alice-only answer"}]
    called = await _tool(client, alice, "call_octop_expert", expert_id=agent_id, message="hello")
    assert called["isError"] is False
    thread_id = called["structuredContent"]["thread_id"]
    arguments = (
        {"message": "read another caller's context"}
        if tool == "call_octop_expert"
        else {"decisions": [{"type": "approve"}]}
    )
    # Even an administrator cannot resume another caller's MCP conversation.
    for other in (bob, admin):
        rejected = await _tool(
            client, other, tool, expert_id=agent_id, thread_id=thread_id, **arguments
        )
        assert rejected["isError"] is True
        assert "thread is not accessible" in rejected["structuredContent"]["error"]
    separate = await _tool(client, bob, "call_octop_expert", expert_id=agent_id, message="hello")
    assert separate["isError"] is False
    assert separate["structuredContent"]["thread_id"] != thread_id


@pytest.mark.asyncio
async def test_agent_mcp_group_grant_and_revocation(
    env_with_agent: tuple[httpx.AsyncClient, Any, dict[str, str], str],
) -> None:
    client, server, admin, agent_id = env_with_agent
    member = await create_user(client, admin, username="member")
    outsider = await create_user(client, admin, username="outsider")
    member_id = await resolve_user_id(client, admin, "member")
    repos = server.services.repos
    group = repos.user_group_repo.create(name="support", description=None)
    repos.user_group_member_repo.add(group.user_group_id, member_id)
    repos.agent_repo.set_shared(agent_id, True)
    GroupAccess(repos).set_visibility(RESOURCE_EXPERT, agent_id, "groups", [group.user_group_id])
    server.app_runtime.agent_registry.get_agent(agent_id).chunks = [
        {"type": "token", "content": "support answer"}
    ]
    listed = await _tool(client, outsider, "list_octop_experts")
    assert agent_id not in {item["expert_id"] for item in listed["structuredContent"]["experts"]}
    denied = await _tool(client, outsider, "call_octop_expert", expert_id=agent_id, message="hi")
    assert denied["isError"] is True
    assert "expert is not accessible" in denied["structuredContent"]["error"]
    allowed = await _tool(client, member, "call_octop_expert", expert_id=agent_id, message="hi")
    assert allowed["isError"] is False
    thread_id = allowed["structuredContent"]["thread_id"]
    # Revoking a grant must also block continuation of a previously valid thread.
    repos.user_group_repo.update(group.user_group_id, enabled=False)
    for tool, arguments in (
        ("call_octop_expert", {"message": "continue"}),
        ("resume_octop_expert", {"decisions": [{"type": "approve"}]}),
    ):
        rejected = await _tool(
            client, member, tool, expert_id=agent_id, thread_id=thread_id, **arguments
        )
        assert rejected["isError"] is True
        assert "expert is not accessible" in rejected["structuredContent"]["error"]


@pytest.mark.asyncio
async def test_agent_mcp_access_token_renews_but_expired_token_is_rejected(
    env_with_agent: tuple[httpx.AsyncClient, Any, dict[str, str], str],
) -> None:
    client, server, admin, _agent_id = env_with_agent
    user_id = await resolve_user_id(client, admin, "admin")
    row = server.services.user_repo.get(user_id)
    # This secret and these tokens belong only to the temporary test database.
    secret = server.services.secret_repo.get("jwt")

    def token(ttl: int) -> str:
        return sign_token(
            secret,
            sub=user_id,
            uname="admin",
            role="admin",
            purpose=PURPOSE_ACCESS,
            ttl_seconds=ttl,
            mfa_version=row.mfa_version,
            password_version=row.password_version,
        )

    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
    renewed = await client.post(
        "/api/mcp/agents", headers={"Authorization": f"Bearer {token(300)}"}, json=body
    )
    assert renewed.status_code == 200
    replacement = renewed.headers[ACCESS_TOKEN_RESPONSE_HEADER]
    accepted = await client.post(
        "/api/mcp/agents", headers={"Authorization": f"Bearer {replacement}"}, json=body
    )
    assert accepted.status_code == 200
    expired = await client.post(
        "/api/mcp/agents", headers={"Authorization": f"Bearer {token(-60)}"}, json=body
    )
    assert expired.status_code == 401
    assert ACCESS_TOKEN_RESPONSE_HEADER not in expired.headers


@pytest.mark.asyncio
async def test_agent_mcp_knowledge_selection_uses_callers_visibility(
    env_with_agent: tuple[httpx.AsyncClient, Any, dict[str, str], str],
) -> None:
    client, server, admin, agent_id = env_with_agent
    caller = await create_user(client, admin, username="support-caller")
    caller_id = await resolve_user_id(client, admin, "support-caller")
    owner_id = await resolve_user_id(client, admin, "admin")
    repos = server.services.repos
    own_default = repos.knowledge_repo.create_base(
        owner_user_id=caller_id, name="caller default", default_open=True
    )
    shared_pick = repos.knowledge_repo.create_base(
        owner_user_id=owner_id, name="expert selected shared base", shared=True
    )
    private_pick = repos.knowledge_repo.create_base(
        owner_user_id=owner_id, name="owner private base", default_open=True
    )
    repos.agent_repo.set_shared(agent_id, True)
    repos.agent_repo.update_config(
        agent_id, knowledge_base_ids=json.dumps([shared_pick.id, private_pick.id])
    )
    runtime_agent = server.app_runtime.agent_registry.get_agent(agent_id)
    runtime_agent.chunks = [{"type": "token", "content": "answer"}]
    result = await _tool(client, caller, "call_octop_expert", expert_id=agent_id, message="hi")
    assert result["isError"] is False
    configurable = runtime_agent.last_request["configurable"]
    assert set(configurable["knowledge_base_ids"]) == {own_default.id, shared_pick.id}
    assert configurable["user_is_admin"] is False
