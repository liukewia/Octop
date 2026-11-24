"""Unit tests for agent lifecycle notifications over Dashboard WebSocket."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from octop_gateway import ChannelSubject, InboundMessage, TextContent

from octop.api.routers.chat.routes import iter_dashboard_hitl_resume_sse
from octop.infra.cron.delivery import CronDeliveryCommand, CronDeliveryService
from octop.infra.gateway.hitl.coordinator import HitlChannelCoordinator
from octop.infra.gateway.hitl.store import HitlPendingStore
from octop.infra.gateway.notifications import (
    build_dashboard_push_frame,
    clean_notice_preview,
    push_dashboard_notice,
    summarize_hitl_notice,
)
from octop.infra.gateway.steer.coordinator import SteerCoordinator
from octop.infra.gateway.ws.ws_channel import WS_CHANNEL_ID, WebSocketChannel
from octop.infra.gateway.ws.ws_hub import WebSocketHub


def _inbound(
    text: str = "hello", *, user_id: str = "7", thread_id: str = "thr_1"
) -> InboundMessage:
    return InboundMessage(
        channel_id=WS_CHANNEL_ID,
        channel_type="dashboard",
        tenant_id="agent_1",
        channel_subject=ChannelSubject(subject_id=user_id),
        channel_session_id="agent_1:dashboard:7:dm",
        content=[TextContent(text=text)],
        metadata={"thread_id": thread_id, "ws_connection_id": "chat_conn"},
    )


class TestSummarizeHitlNotice:
    def test_ask_user_question_extracts_first_question(self) -> None:
        subtype, summary = summarize_hitl_notice(
            {
                "action_requests": [
                    {
                        "name": "ask_user_question",
                        "args": {
                            "questions": [
                                {"question": "应该部署到测试环境还是生产环境？"},
                            ]
                        },
                    }
                ]
            },
            locale="zh",
        )
        assert subtype == "ask"
        assert summary == "应该部署到测试环境还是生产环境？"

    def test_tool_approval_uses_localized_tool_names(self) -> None:
        subtype, summary = summarize_hitl_notice(
            {
                "action_requests": [
                    {"name": "execute", "args": {"command": "rm -rf build"}},
                ]
            },
            locale="zh",
        )
        assert subtype == "approval"
        assert summary

    def test_clean_notice_preview_strips_think_tags(self) -> None:
        assert clean_notice_preview("<think>secret</think>  最终结论  ") == "最终结论"


class TestPushDashboardNotice:
    @pytest.mark.asyncio
    async def test_pushes_typed_frame_to_user_notification_sockets(self) -> None:
        hub = WebSocketHub()
        notify_send = AsyncMock()
        hub.register("notify_1", notify_send, user_id=7)

        frame = build_dashboard_push_frame(
            agent_id="agent_1",
            thread_id="thr_1",
            kind="task_completed",
            text="<think>plan</think> 报告已生成",
            agent_name="研究助手",
            event_id="turn-done:t1",
        )
        assert frame == {
            "type": "dashboard_push",
            "kind": "task_completed",
            "agent_id": "agent_1",
            "thread_id": "thr_1",
            "text": "报告已生成",
            "agent_name": "研究助手",
            "event_id": "turn-done:t1",
        }

        await push_dashboard_notice(
            hub,
            user_id=7,
            agent_id="agent_1",
            thread_id="thr_1",
            kind="hitl_required",
            text="确认执行命令",
            agent_name="研究助手",
            event_id="hitl:p1",
            hitl_subtype="approval",
        )
        notify_send.assert_awaited_once_with(
            {
                "type": "dashboard_push",
                "kind": "hitl_required",
                "agent_id": "agent_1",
                "thread_id": "thr_1",
                "text": "确认执行命令",
                "agent_name": "研究助手",
                "event_id": "hitl:p1",
                "hitl_subtype": "approval",
            }
        )


class TestWebSocketChannelNotifications:
    @pytest.mark.asyncio
    async def test_emits_task_completed_on_finished_turn(self) -> None:
        hub = WebSocketHub()
        chat_send = AsyncMock()
        notify_send = AsyncMock()
        hub.register("chat_conn", chat_send)
        hub.subscribe("thr_1", "chat_conn")
        hub.register("notify_conn", notify_send, user_id=7)

        async def iter_turn_chunks(_msg: InboundMessage):
            yield {"type": "token", "content": "任务"}
            yield {"type": "token", "content": "已完成"}
            yield {"type": "done"}

        proc = SimpleNamespace(
            iter_turn_chunks=iter_turn_chunks,
            _agent_repo=SimpleNamespace(get=lambda _aid: SimpleNamespace(name="开发专家")),
        )
        channel = WebSocketChannel(proc, hub=hub, steer=SteerCoordinator())  # type: ignore[arg-type]

        await channel.handle_inbound(_inbound("帮我重构"))

        notify_send.assert_awaited_once()
        sent = notify_send.await_args.args[0]
        assert sent["type"] == "dashboard_push"
        assert sent["kind"] == "task_completed"
        assert sent["agent_id"] == "agent_1"
        assert sent["thread_id"] == "thr_1"
        assert sent["agent_name"] == "开发专家"
        assert sent["text"] == "任务已完成"

    @pytest.mark.asyncio
    async def test_emits_hitl_required_and_skips_task_completed_when_paused(self) -> None:
        hub = WebSocketHub()
        chat_send = AsyncMock()
        notify_send = AsyncMock()
        hub.register("chat_conn", chat_send)
        hub.subscribe("thr_1", "chat_conn")
        hub.register("notify_conn", notify_send, user_id=7)

        async def iter_turn_chunks(_msg: InboundMessage):
            yield {
                "type": "hitl_required",
                "pending_id": "pend_1",
                "request": {
                    "action_requests": [
                        {
                            "name": "ask_user_question",
                            "args": {"questions": [{"question": "确认删除旧日志吗？"}]},
                        }
                    ]
                },
            }

        proc = SimpleNamespace(iter_turn_chunks=iter_turn_chunks)
        channel = WebSocketChannel(proc, hub=hub, steer=SteerCoordinator())  # type: ignore[arg-type]
        await channel.handle_inbound(_inbound("清理日志"))

        notify_send.assert_awaited_once()
        sent = notify_send.await_args.args[0]
        assert sent["kind"] == "hitl_required"
        assert sent["hitl_subtype"] == "ask"
        assert sent["event_id"] == "hitl:pend_1"
        assert sent["text"] == "确认删除旧日志吗？"

    @pytest.mark.asyncio
    async def test_emits_task_failed_on_error_event(self) -> None:
        hub = WebSocketHub()
        chat_send = AsyncMock()
        notify_send = AsyncMock()
        hub.register("chat_conn", chat_send)
        hub.subscribe("thr_1", "chat_conn")
        hub.register("notify_conn", notify_send, user_id=7)

        async def iter_turn_chunks(_msg: InboundMessage):
            yield {"type": "error", "message": "模型连接超时"}

        proc = SimpleNamespace(iter_turn_chunks=iter_turn_chunks)
        channel = WebSocketChannel(proc, hub=hub, steer=SteerCoordinator())  # type: ignore[arg-type]
        await channel.handle_inbound(_inbound("生成周报"))

        notify_send.assert_awaited_once()
        sent = notify_send.await_args.args[0]
        assert sent["kind"] == "task_failed"
        assert sent["text"] == "模型连接超时"

    @pytest.mark.asyncio
    async def test_suppresses_notification_on_stop_slash_or_cancelled_turn(self) -> None:
        hub = WebSocketHub()
        chat_send = AsyncMock()
        notify_send = AsyncMock()
        hub.register("chat_conn", chat_send)
        hub.subscribe("thr_1", "chat_conn")
        hub.register("notify_conn", notify_send, user_id=7)
        steer = SteerCoordinator()

        async def stop_chunks(_msg: InboundMessage):
            yield {"type": "token", "content": "已停止"}
            yield {"type": "done"}

        channel = WebSocketChannel(
            SimpleNamespace(iter_turn_chunks=stop_chunks),  # type: ignore[arg-type]
            hub=hub,
            steer=steer,
        )
        await channel.handle_inbound(_inbound("/stop"))
        notify_send.assert_not_awaited()

        async def cancelled_chunks(_msg: InboundMessage):
            steer.mark_cancelling("thr_1")
            yield {"type": "token", "content": "半截输出"}
            yield {"type": "done"}

        channel_cancel = WebSocketChannel(
            SimpleNamespace(iter_turn_chunks=cancelled_chunks),  # type: ignore[arg-type]
            hub=hub,
            steer=steer,
        )
        await channel_cancel.handle_inbound(_inbound("长任务"))
        notify_send.assert_not_awaited()


class TestHitlResumeSseNotifications:
    @pytest.mark.asyncio
    async def test_resume_sse_notifies_completion_after_approval(self) -> None:
        notify_event = AsyncMock()
        server = SimpleNamespace(
            app_runtime=SimpleNamespace(
                gateway=SimpleNamespace(
                    notify_dashboard_event=notify_event,
                    steer=None,
                    ws_hub=None,
                    channel_manager=None,
                )
            )
        )
        coordinator = HitlChannelCoordinator(store=HitlPendingStore())

        async def iter_resume(**_kwargs: Any):
            yield {"type": "token", "content": "审批后执行成功"}

        processor = SimpleNamespace(iter_hitl_resume_chunks=iter_resume)
        frames = [
            frame
            async for frame in iter_dashboard_hitl_resume_sse(
                server=server,
                processor=processor,
                hitl_coordinator=coordinator,
                pending=None,
                agent_id="agent_1",
                thread_id="thr_1",
                user_id=7,
                session_key="agent_1:dashboard:7:dm",
                channel_type="dashboard",
                decisions=[{"type": "approve"}],
                locale="zh",
                is_disconnected=AsyncMock(return_value=False),
            )
        ]
        assert any('"done"' in f for f in frames)
        notify_event.assert_awaited_once_with(
            user_id=7,
            agent_id="agent_1",
            thread_id="thr_1",
            kind="task_completed",
            text="审批后执行成功",
        )


class TestCronDeliveryFailureNotification:
    @pytest.mark.asyncio
    async def test_cron_failure_emits_task_failed_dashboard_event(self) -> None:
        session = SimpleNamespace(
            user_id=7,
            agent_id="agent_1",
            thread_id="thr_cron",
            channel_type="dashboard",
            session_key="agent_1:dashboard:7:dm",
        )
        notify_event = AsyncMock()
        notify_push = AsyncMock()

        async def run_in_session(_agent_id: str, _sk: str, fn: Any) -> Any:
            return await fn()

        gateway = SimpleNamespace(
            thread_registry=SimpleNamespace(
                CHANNEL_DASHBOARD="dashboard",
                reset_by_session_key=AsyncMock(),
                get_session=lambda _sk: session,
            ),
            require_session=lambda _aid, _sk: session,
            run_in_session=run_in_session,
            notify_dashboard_event=notify_event,
            notify_dashboard_push=notify_push,
        )
        def fail_lookup(_agent_id: str) -> None:
            raise RuntimeError("执行失败")

        agent_manager = SimpleNamespace(
            workspace_for_agent=lambda _aid: None,
            get_row=fail_lookup,
        )
        repos = SimpleNamespace(user_repo=None)
        service = CronDeliveryService(
            gateway=gateway,  # type: ignore[arg-type]
            agent_manager=agent_manager,  # type: ignore[arg-type]
            repos=repos,  # type: ignore[arg-type]
        )

        with pytest.raises(RuntimeError):
            await service.deliver(
                CronDeliveryCommand(
                    cron_id="c1",
                    cron_name="每日巡检",
                    user_id=7,
                    agent_id="agent_1",
                    session_key="agent_1:dashboard:7:dm",
                    prompt="echo hi",
                    fresh_thread=True,
                    task_type="agent",
                    model=None,
                    mcp_servers=(),
                )
            )

        notify_push.assert_not_awaited()
        notify_event.assert_awaited_once()
        kwargs = notify_event.await_args.kwargs
        assert kwargs["kind"] == "task_failed"
        assert kwargs["user_id"] == 7
        assert kwargs["agent_id"] == "agent_1"
        assert kwargs["thread_id"] == "thr_cron"
        assert "每日巡检" in kwargs["text"]
