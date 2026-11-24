"""Structured Dashboard notification payloads and HITL/turn summaries."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Literal

from octop.i18n import tool_display_name
from octop.infra.gateway.hitl.format import ASK_USER_TOOL_NAME, parse_action_requests
from octop.infra.utils.llm_text import strip_thinking
from octop.infra.utils.locale import DEFAULT_LOCALE, normalize_locale

if TYPE_CHECKING:
    from octop.infra.gateway.ws.ws_hub import WebSocketHub

logger = logging.getLogger(__name__)

DashboardNoticeKind = Literal[
    "hitl_required",
    "task_completed",
    "task_failed",
    "proactive_push",
]
HitlNoticeSubtype = Literal["ask", "approval"]

_PREVIEW_MAX_CHARS = 240


def clean_notice_preview(text: str, *, limit: int = _PREVIEW_MAX_CHARS) -> str:
    """Strip ``<think>`` blocks and collapse whitespace for a short notice preview."""
    cleaned = " ".join(strip_thinking(text or "").split()).strip()
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[: limit - 1]}…"


def summarize_hitl_notice(
    request: dict[str, Any] | None,
    *,
    locale: str = DEFAULT_LOCALE,
) -> tuple[HitlNoticeSubtype, str]:
    """Classify an HITL pause and build a concise body line."""
    norm_locale = normalize_locale(locale)
    if not isinstance(request, dict):
        return "approval", ""
    actions = parse_action_requests(request)
    for action in actions:
        if action.get("name") != ASK_USER_TOOL_NAME:
            continue
        question = _extract_ask_question(action.get("args"))
        if not question:
            desc = action.get("description")
            question = desc.strip() if isinstance(desc, str) else ""
        return "ask", clean_notice_preview(question)

    labels: list[str] = []
    seen: set[str] = set()
    first_desc = ""
    for action in actions:
        raw_name = str(action.get("name") or "").strip()
        if raw_name:
            label = tool_display_name(raw_name, norm_locale)
            if label not in seen:
                seen.add(label)
                labels.append(label)
        if not first_desc:
            desc = action.get("description")
            if isinstance(desc, str) and desc.strip():
                first_desc = desc.strip()

    sep = "、" if locale == "zh" else ", "
    joined = sep.join(labels)
    if joined and first_desc and first_desc != joined:
        return "approval", clean_notice_preview(f"{joined}: {first_desc}")
    return "approval", clean_notice_preview(joined or first_desc)


def _extract_ask_question(args: Any) -> str:
    if not isinstance(args, dict):
        return ""
    questions = args.get("questions")
    if isinstance(questions, list):
        for item in questions:
            if not isinstance(item, dict):
                continue
            for key in ("question", "prompt", "title"):
                val = item.get(key)
                if isinstance(val, str) and val.strip():
                    return val.strip()
    for key in ("question", "prompt"):
        val = args.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return ""


def build_dashboard_push_frame(
    *,
    agent_id: str,
    thread_id: str,
    kind: DashboardNoticeKind = "proactive_push",
    text: str = "",
    agent_name: str | None = None,
    event_id: str | None = None,
    hitl_subtype: HitlNoticeSubtype | None = None,
) -> dict[str, Any]:
    """Build a ``dashboard_push`` frame for ``/api/notifications/ws``."""
    resolved_name = (agent_name or "").strip() or agent_id
    preview = text if kind == "proactive_push" else clean_notice_preview(text)
    frame: dict[str, Any] = {
        "type": "dashboard_push",
        "kind": kind,
        "agent_id": agent_id,
        "thread_id": thread_id,
        "text": preview,
        "agent_name": resolved_name,
    }
    if event_id:
        frame["event_id"] = event_id
    if hitl_subtype:
        frame["hitl_subtype"] = hitl_subtype
    return frame


async def push_dashboard_notice(
    hub: WebSocketHub | None,
    *,
    user_id: int,
    agent_id: str,
    thread_id: str,
    kind: DashboardNoticeKind,
    text: str = "",
    agent_name: str | None = None,
    event_id: str | None = None,
    hitl_subtype: HitlNoticeSubtype | None = None,
) -> None:
    """Best-effort fan-out of a structured notification to a user's sockets."""
    if hub is None or user_id <= 0 or not agent_id.strip():
        return
    if kind == "proactive_push" and not text.strip():
        return
    frame = build_dashboard_push_frame(
        agent_id=agent_id.strip(),
        thread_id=thread_id.strip(),
        kind=kind,
        text=text,
        agent_name=agent_name,
        event_id=event_id,
        hitl_subtype=hitl_subtype,
    )
    try:
        await hub.push_to_user(user_id, frame)
    except Exception:
        logger.warning(
            "failed to push dashboard notice kind=%s agent=%s thread=%s",
            kind,
            agent_id,
            thread_id,
            exc_info=True,
        )


__all__ = [
    "DashboardNoticeKind",
    "HitlNoticeSubtype",
    "build_dashboard_push_frame",
    "clean_notice_preview",
    "push_dashboard_notice",
    "summarize_hitl_notice",
]
