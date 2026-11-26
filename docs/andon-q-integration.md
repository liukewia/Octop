# Octop 接入安灯 Q：MCP 联调准备

## 状态与边界

本文是基于当前代码的接入准备，不代表已完成安灯 Q 或企微外部群联调。
Octop 已有 HTTP MCP 专家入口，本次复用它，不新增 A2A 服务、不新增企微长连接。
安灯 Cloud Agent、Team 与现有技术顾问机器人如何配置，仍须以实际部署文档和环境为准。
历史讨论中的安灯能力仅是待验证前提，不能据此假定某种 UI、配置字段或凭证续期能力存在。

拟议链路（安灯侧待验证）：

```text
企微外部群 ⇄ 现有技术顾问机器人 / 安灯 Team
                              ⇅
                       安灯 Cloud Agent
                              ⇅ HTTP MCP + Bearer
                       Octop 知识库专家
```

企微消息收发、群绑定与路由仍由现有机器人链路负责；不要让 Octop 使用同一机器人凭证再次建立连接。
Octop 只返回调用结果，不负责将结果自动发回指定企微群。

## 已核实的 Octop 契约

- 完整地址：`https://<octop-host>/api/mcp/agents`，支持 POST、可选 GET SSE 与 DELETE。
  对外部署须由运维保证 HTTPS、网络可达及反向代理正确转发相关头。
- POST 是 MCP JSON-RPC，不是普通 REST 问答接口。支持 `initialize`、`ping`、
  `tools/list`、`tools/call` 与 `notifications/initialized`。
- 工具为 `list_octop_experts`、`call_octop_expert`、`resume_octop_expert`。
- `initialize` 返回 `mcp-session-id`。该值不是访问凭证，也不是聊天 `thread_id`。
  每次 HTTP 请求仍须认证，不能用会话头代替 Bearer。
- `call_octop_expert` 必需参数是 `expert_id`、`message`；可选 `thread_id`。
  不传 `thread_id` 会创建新对话；传入时只允许同一 Octop 用户、同一专家的 MCP 对话。
  Dashboard、CLI、IM 对话不可在此续接。
- 结果在 MCP `structuredContent` 中，同时有 JSON 文本 `content`。
  调用方必须检查 MCP `isError`、JSON-RPC `error` 及业务 `status`，不能只看 HTTP 200。
- 正常结果有 `status`、`expert_id`、`thread_id`、`response`。
  `status` 可为 `completed`、`failed` 或 `approval_required`。
  `response` 是累积的回复文本，不是逐 token SSE 流；GET SSE 不是回答推送通道。
- 遇到 `approval_required` 应保留上下文并进入可信的人审/补充信息流程。
  不能把来自外部群的文字直接转换为 `approve`，也不能对审批工具自动放行。

对应实现：`src/octop/api/routers/agent_mcp.py`、
`src/octop/infra/agent_mcp/protocol.py`、`src/octop/infra/agent_mcp/service.py`。
通用工具配置示例见 [API 文档](api.md#octop-agent-mcp-gateway)；其配置键并非安灯专用格式。

## 权限、知识库与群隔离

专家可见性使用现有授权规则：专家 owner / 管理员，或共享专家的用户组授权。
普通用户获得授权后可以调用，不需要把机器人账号提升为管理员。
共享专家若没有用户组范围限制，默认对其他用户可见；不能只打开共享就认为已限定客服账号。
共享专家不等于共享其 owner 的私有知识库：回合知识库选择仍按调用者可见范围过滤。

建议在隔离测试部署中使用专用的非管理员 Octop 用户，仅配置服务所需的资源和权限。
先为该用户授权目标专家及可供群用户查看的知识库，并明确配置专家默认知识库。
MCP 工具没有 `knowledge_base_ids` 参数；它使用调用者自己 default-open 的知识库，
加上专家已配置且调用者仍可见的默认知识库。
其他用户共享但仅对其本人 default-open 的知识库，不会仅因共享而自动选中。
“专家能调用”不等于“知识库检索已验证”：真实文档入库、检索与答案引用仍须单独验收。

**重要：Octop 的隔离主体是 Octop 用户，不是企微外部群成员。**
多个群共用同一个 Bearer 时，Octop 不知道原始群身份，也无法阻止该身份持有者续接另一个群的
`thread_id`。当前接口没有经过验证的外部租户/群身份声明。

因此至少需要：

1. 安灯侧可信路由状态按租户、群、会话、专家分别保存 `thread_id`，禁止交叉复用；
   不要让模型从群消息中自行挑选任意 `thread_id`。
2. 对严格保密的不同群使用不同 Octop 身份/资源授权，或在明确设计并验证可信身份桥接后再上线；
   仅加群 ID 提示词不是安全边界。
3. 外部群只能使用明确允许向该群披露的知识库；避免给调用身份授权内部全量知识库。
4. 对专家能力进行最小化配置。知识库问答不应顺便开放不需要的命令执行、管理或写操作。

相关规则：`infra/users/groups.py:expert_visible_to`、
`infra/agent_mcp/service.py:_require_mcp_thread`、
`infra/agents/turn_resources.py:attach_turn_knowledge`、
`infra/knowledge/default_open.py:merge_knowledge_base_ids`。

## 凭证生命周期：生产接入的未决项

当前入口复用普通登录 access JWT，而不是独立的 MCP 专用服务凭证。
默认有效期在当前基线是 86400 秒，由 `access_token_ttl_seconds` 配置。
这只是当前代码事实，不是建议把全局登录 TTL 拉长。

中间件在剩余寿命低于配置 TTL 的 2/3 时可通过 `X-Octop-Access-Token` 响应头返回新 token。
调用方必须安全保存并在后续请求替换它；旧 token 的到期时间并不会被服务器延长。
过期 token 被拒绝，不能依靠 MCP 会话 ID 续期。
密码版本、MFA 版本变化及用户禁用也影响 token 有效性。

当前未找到可直接用于此场景、同时具备 MCP 路径/专家范围约束和独立撤销能力的服务凭证入口。
普通 JWT 不是仅能访问 MCP 的 token，还能访问该用户本来有权限访问的其他 API。
不要把管理员 JWT、永久全权限 token、设备免登凭证或服务器签名密钥放进安灯配置。

上线前必须验证安灯实际是否能更新并持久化自定义响应头中的 token，以及空闲过期后的安全恢复方式。
若不能，需另行确定有限时效、可撤销、限制受众/操作/专家范围、可审计的服务凭证方案。
本次没有擅自新增凭证体系或把用户密码保存到桥接脚本中。
也没有假定安灯一定不支持续期；它的实际能力尚未验证。

## 无模型调用的连通性检查

以下仅为操作手册；不会自动创建用户、授权资源、发送企微消息或执行专家任务。
在隔离测试部署准备好合法短期凭证后，可用项目锁定依赖中的 MCP Python SDK 验证初始化和列举。
凭证从交互式隐藏输入读取，不写入命令行参数或文件，也不要把它粘进日志。
将示例域名替换为实际获准访问的测试地址，不要直接把内网环境暴露到公网。

```bash
OCTOP_MCP_TEST_URL="https://<approved-test-host>/api/mcp/agents" uv run python - <<'PYTHON'
import asyncio
import os
from getpass import getpass

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

async def main():
    url = os.environ["OCTOP_MCP_TEST_URL"].strip()
    if not url.startswith("https://") or not url.endswith("/api/mcp/agents"):
        raise ValueError("Use the approved HTTPS /api/mcp/agents test endpoint")
    token = getpass("Short-lived Octop access token: ")
    async with httpx.AsyncClient(
        headers={"Authorization": f"Bearer {token}"}, timeout=30, follow_redirects=False
    ) as client:
        async with streamable_http_client(url, http_client=client) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = await session.list_tools()
                print("Tools:", [tool.name for tool in tools.tools])
                result = await session.call_tool("list_octop_experts", {})
                if result.isError:
                    raise RuntimeError("Expert listing failed; inspect sanitized server logs")
                print("Visible expert count:", result.structuredContent["count"])

asyncio.run(main())
PYTHON
```

此检查只证明 MCP 协议、认证与专家列举可用，不证明长期认证、问答质量或群路由可用。

## 联调验收清单（尚未执行）

- [ ] 安灯实际支持的 HTTP MCP 传输类型、配置格式和自定义认证头得到确认。
- [ ] 安灯所在网络可访问 Octop HTTPS，代理正确转发 Authorization、MCP 会话及协议头。
- [ ] 普通授权用户可列举/调用目标专家，未授权专家不显示且不可调用。
- [ ] 使用可检索的测试文档验证答案与引用；私有、未授权知识库不进入回答。
- [ ] 两个不同群、并发提问、重试与服务重启后不会串话或重复发群。
- [ ] 凭证轮换、到期、空闲恢复、用户禁用和权限收回流程经过真实客户端验证。
- [ ] `failed`、超时、`approval_required` 都有安全、清晰的用户提示与人工接管路径。
- [ ] 客户端超时不被当作服务端已取消；避免盲目重试产生重复专家回合。
- [ ] 现有机器人仍是唯一企微收发者；一次问题只回到正确群且只发送一次。

## 本地自动化验证

```bash
uv run pytest tests/integration/test_agent_mcp_gateway.py \
  tests/integration/test_agent_mcp_readiness.py tests/unit/agent_mcp -q
```

`test_agent_mcp_readiness.py` 使用 SDK 进行初始化、列工具、调用与 ping，并验证用户间对话隔离、
用户组权限收回、知识库回合选择以及 JWT 续期头/过期拒绝。
测试运行于临时 SQLite 与 ASGI 内存传输，模型是 FakeHarnessAgent；
它不验证真实网络 SSE、反向代理、安灯客户端、真实检索或企微群消息。
