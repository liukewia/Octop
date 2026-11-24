import { beforeEach, describe, expect, it } from "vitest";
import {
  buildAgentNoticePath,
  claimPushLock,
  claimSystemPush,
  formatAgentNoticeCopy,
  isDashboardPushPath,
  isViewingTargetThread,
  markPushHandled,
  parseDashboardPushFrame,
  PUSH_HANDLED_TTL_MS,
  pushDedupeKey,
  readSystemNotifyPermission,
  shouldSuppressAgentNotification,
  systemNotificationTag,
  truncatePushText,
  wasPushHandled,
} from "./dashboardPushToast";

describe("parseDashboardPushFrame", () => {
  it("accepts legacy dashboard_push frames and defaults kind to proactive_push", () => {
    expect(
      parseDashboardPushFrame({
        type: "dashboard_push",
        agent_id: "a1",
        thread_id: "thr_1",
        text: "记得喝水",
        agent_name: "助手",
      }),
    ).toEqual({
      type: "dashboard_push",
      kind: "proactive_push",
      agent_id: "a1",
      thread_id: "thr_1",
      text: "记得喝水",
      agent_name: "助手",
    });
  });

  it("parses structured agent lifecycle kinds and HITL subtypes", () => {
    expect(
      parseDashboardPushFrame({
        type: "dashboard_push",
        kind: "hitl_required",
        hitl_subtype: "ask",
        event_id: "hitl:p_1",
        agent_id: "a1",
        thread_id: "thr_1",
        text: "请选择部署环境",
        agent_name: "助手",
      }),
    ).toEqual({
      type: "dashboard_push",
      kind: "hitl_required",
      hitl_subtype: "ask",
      event_id: "hitl:p_1",
      agent_id: "a1",
      thread_id: "thr_1",
      text: "请选择部署环境",
      agent_name: "助手",
    });

    expect(
      parseDashboardPushFrame({
        type: "dashboard_push",
        kind: "task_completed",
        agent_id: "a1",
        thread_id: "thr_1",
        text: "",
      }),
    ).toEqual({
      type: "dashboard_push",
      kind: "task_completed",
      agent_id: "a1",
      thread_id: "thr_1",
      text: "",
    });

    expect(
      parseDashboardPushFrame({
        type: "dashboard_push",
        kind: "task_failed",
        agent_id: "a1",
        thread_id: "",
        text: "早报任务: 脚本超时",
      }),
    ).toEqual({
      type: "dashboard_push",
      kind: "task_failed",
      agent_id: "a1",
      thread_id: "",
      text: "早报任务: 脚本超时",
    });
  });

  it("rejects unknown kinds, non-push frames, and incomplete payloads", () => {
    expect(
      parseDashboardPushFrame({ type: "token", content: "hi" }),
    ).toBeNull();
    expect(
      parseDashboardPushFrame({
        type: "dashboard_push",
        agent_id: "a1",
        text: "x",
      }),
    ).toBeNull();
    expect(
      parseDashboardPushFrame({
        type: "dashboard_push",
        kind: "unknown_kind",
        agent_id: "a1",
        thread_id: "thr_1",
        text: "x",
      }),
    ).toBeNull();
    expect(parseDashboardPushFrame(null)).toBeNull();
  });
});

describe("truncatePushText", () => {
  it("keeps short text intact and truncates long text with an ellipsis", () => {
    expect(truncatePushText("记得喝水")).toBe("记得喝水");
    const long = "a".repeat(300);
    const out = truncatePushText(long, 80);
    expect(out.length).toBe(81);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("shouldSuppressAgentNotification & route matching", () => {
  it("matches normal and encoded bridge/team chat paths", () => {
    expect(isViewingTargetThread("/chat/a1/t1", "a1", "t1")).toBe(true);
    expect(
      isViewingTargetThread(
        "/chat/bridge%3Ac1%3Aa1/room~m1",
        "bridge:c1:a1",
        "room~m1",
      ),
    ).toBe(true);
    expect(isViewingTargetThread("/chat/a1/t2", "a1", "t1")).toBe(false);
    expect(isViewingTargetThread("/settings", "a1", "t1")).toBe(false);
  });

  it("suppresses only when focused, visible, and viewing the target thread", () => {
    expect(
      shouldSuppressAgentNotification({
        visible: true,
        focused: true,
        pathname: "/chat/a1/t1",
        agentId: "a1",
        threadId: "t1",
      }),
    ).toBe(true);

    // Focused window on another thread or settings MUST notify
    expect(
      shouldSuppressAgentNotification({
        visible: true,
        focused: true,
        pathname: "/chat/a1/t2",
        agentId: "a1",
        threadId: "t1",
      }),
    ).toBe(false);
    expect(
      shouldSuppressAgentNotification({
        visible: true,
        focused: true,
        pathname: "/settings",
        agentId: "a1",
        threadId: "t1",
      }),
    ).toBe(false);

    // Blurred or hidden window on the same thread MUST notify
    expect(
      shouldSuppressAgentNotification({
        visible: true,
        focused: false,
        pathname: "/chat/a1/t1",
        agentId: "a1",
        threadId: "t1",
      }),
    ).toBe(false);
    expect(
      shouldSuppressAgentNotification({
        visible: false,
        focused: false,
        pathname: "/chat/a1/t1",
        agentId: "a1",
        threadId: "t1",
      }),
    ).toBe(false);
  });
});

describe("formatAgentNoticeCopy", () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    opts?.name ? `${key}:${String(opts.name)}` : key;

  it("formats copy per kind and falls back when body is empty", () => {
    expect(
      formatAgentNoticeCopy(
        {
          kind: "hitl_required",
          hitl_subtype: "approval",
          agent_name: "架构师",
          text: "Shell",
        },
        t,
      ),
    ).toEqual({
      title: "chat.pushToast.hitlApprovalTitle:架构师",
      body: "Shell",
    });

    expect(
      formatAgentNoticeCopy(
        {
          kind: "hitl_required",
          hitl_subtype: "ask",
          agent_name: "架构师",
          text: "",
        },
        t,
      ),
    ).toEqual({
      title: "chat.pushToast.hitlAskTitle:架构师",
      body: "chat.pushToast.hitlBodyFallback",
    });

    expect(
      formatAgentNoticeCopy(
        {
          kind: "task_completed",
          agent_name: "研究员",
          text: "",
        },
        t,
      ),
    ).toEqual({
      title: "chat.pushToast.completedTitle:研究员",
      body: "chat.pushToast.completedBodyFallback",
    });

    expect(
      formatAgentNoticeCopy(
        {
          kind: "task_failed",
          text: "API 502",
        },
        t,
      ),
    ).toEqual({
      title: "chat.pushToast.failedTitleFallback",
      body: "API 502",
    });
  });
});

describe("readSystemNotifyPermission & path validation", () => {
  it("treats an insecure or missing Notification API as unsupported", () => {
    expect(readSystemNotifyPermission(false, { permission: "granted" })).toBe(
      "unsupported",
    );
    expect(readSystemNotifyPermission(true, undefined)).toBe("unsupported");
    expect(readSystemNotifyPermission(true, { permission: "granted" })).toBe(
      "granted",
    );
  });

  it("validates in-app chat paths including bridge and 1-segment agent paths", () => {
    expect(isDashboardPushPath("/chat/01AGENT/01THREAD")).toBe(true);
    expect(
      isDashboardPushPath(
        buildAgentNoticePath({
          agent_id: "bridge:conn1:agent2",
          thread_id: "room~member",
        }),
      ),
    ).toBe(true);
    expect(isDashboardPushPath("/chat/01AGENT")).toBe(true);
    expect(isDashboardPushPath("/settings")).toBe(false);
    expect(isDashboardPushPath("/chat/a/b/extra")).toBe(false);
    expect(isDashboardPushPath("https://evil.example/chat/a/b")).toBe(false);
  });
});

describe("system notification dedupe", () => {
  const key = "thr_1\n记得喝水";

  beforeEach(() => {
    localStorage.clear();
  });

  it("tags threads and prioritizes explicit event_id for dedupe", () => {
    expect(systemNotificationTag("thr_1")).toBe("dash-push:thr_1");
    expect(systemNotificationTag("thr_1", "hitl_required")).toBe(
      "dash-hitl:thr_1",
    );
    expect(
      pushDedupeKey({
        thread_id: "thr_1",
        text: "x",
        event_id: "hitl:p1",
      }),
    ).toBe("evt:hitl:p1");
  });

  it("gives the notification lock to one tab and suppresses handled events", () => {
    expect(claimPushLock(localStorage, key, "tab-a", 1_000)).toBe(true);
    expect(claimPushLock(localStorage, key, "tab-b", 1_100)).toBe(false);

    localStorage.clear();
    expect(claimSystemPush(localStorage, key, "tab-a", 1_000)).toBe(true);
    expect(claimSystemPush(localStorage, key, "tab-b", 1_100)).toBe(false);

    localStorage.clear();
    markPushHandled(localStorage, key, 2_000);
    expect(wasPushHandled(localStorage, key, 2_500)).toBe(true);
    expect(wasPushHandled(localStorage, key, 2_000 + PUSH_HANDLED_TTL_MS)).toBe(
      false,
    );
    expect(claimSystemPush(localStorage, key, "tab-a", 2_100)).toBe(false);
  });
});
