import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrowserNotificationAdapter,
  createNotificationAdapter,
  DesktopNotificationAdapter,
  type AgentNoticePayload,
  type BrowserNotificationConstructor,
  type BrowserNotificationHandle,
} from "./index";

function samplePayload(
  overrides: Partial<AgentNoticePayload> = {},
): AgentNoticePayload {
  return {
    kind: "hitl_required",
    hitlSubtype: "approval",
    agentId: "agent_1",
    threadId: "thr_1",
    agentName: "助手",
    title: "助手 等待你的审批",
    body: "执行终端命令",
    path: "/chat/agent_1/thr_1",
    tag: "dash-hitl:thr_1",
    dedupeKey: "evt:hitl:p1",
    ...overrides,
  };
}

function makeNotificationCtor(permission: string): {
  Ctor: BrowserNotificationConstructor;
  created: Array<{
    title: string;
    options?: NotificationOptions;
    handle: BrowserNotificationHandle & { closed: boolean };
  }>;
} {
  const created: Array<{
    title: string;
    options?: NotificationOptions;
    handle: BrowserNotificationHandle & { closed: boolean };
  }> = [];

  class FakeNotification implements BrowserNotificationHandle {
    static readonly permission = permission;
    onclick: (() => void) | null = null;
    closed = false;

    constructor(title: string, options?: NotificationOptions) {
      created.push({ title, options, handle: this });
    }

    close(): void {
      this.closed = true;
    }
  }

  return {
    Ctor: FakeNotification as unknown as BrowserNotificationConstructor,
    created,
  };
}

describe("createNotificationAdapter", () => {
  it("selects DesktopNotificationAdapter when desktopBridge is present, otherwise BrowserNotificationAdapter", () => {
    const desktop = createNotificationAdapter({
      desktopBridge: { showMessageNotice: vi.fn() },
      tabId: "t1",
      openUiToast: vi.fn(),
      onNavigate: vi.fn(),
    });
    expect(desktop.carrier).toBe("desktop");
    expect(desktop).toBeInstanceOf(DesktopNotificationAdapter);

    const browser = createNotificationAdapter({
      desktopBridge: null,
      tabId: "t1",
      openUiToast: vi.fn(),
      onNavigate: vi.fn(),
    });
    expect(browser.carrier).toBe("browser");
    expect(browser).toBeInstanceOf(BrowserNotificationAdapter);
  });
});

describe("BrowserNotificationAdapter", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses Browser Notification (without UI toast) when permission is granted", async () => {
    const openUiToast = vi.fn();
    const onNavigate = vi.fn();
    const focusWindow = vi.fn();
    const { Ctor, created } = makeNotificationCtor("granted");

    const adapter = new BrowserNotificationAdapter({
      tabId: "tab-1",
      openUiToast,
      onNavigate,
      focusWindow,
      getStorage: () => localStorage,
      isSecureContext: () => true,
      getNotificationApi: () => Ctor,
      peekServiceWorkerRegistration: () => null,
    });

    await adapter.notify(samplePayload());

    expect(created).toHaveLength(1);
    expect(created[0]?.title).toBe("助手 等待你的审批");
    expect(created[0]?.options?.body).toBe("执行终端命令");
    expect(openUiToast).not.toHaveBeenCalled();

    created[0]?.handle.onclick?.();
    expect(focusWindow).toHaveBeenCalledTimes(1);
    expect(created[0]?.handle.closed).toBe(true);
    expect(onNavigate).toHaveBeenCalledWith("/chat/agent_1/thr_1");
  });

  it("prefers active ServiceWorker showNotification when permission is granted", async () => {
    const openUiToast = vi.fn();
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const { Ctor, created } = makeNotificationCtor("granted");

    const adapter = new BrowserNotificationAdapter({
      tabId: "tab-1",
      openUiToast,
      onNavigate: vi.fn(),
      getStorage: () => localStorage,
      isSecureContext: () => true,
      getNotificationApi: () => Ctor,
      peekServiceWorkerRegistration: () => ({ showNotification }),
    });

    await adapter.notify(samplePayload());

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(0);
    expect(openUiToast).not.toHaveBeenCalled();
  });

  it("uses UI library notification when permission is default, denied, or unsupported", async () => {
    for (const [perm, expectedExtra] of [
      ["default", "enable"],
      ["denied", "none"],
    ] as const) {
      localStorage.clear();
      const openUiToast = vi.fn();
      const { Ctor, created } = makeNotificationCtor(perm);
      const adapter = new BrowserNotificationAdapter({
        tabId: "tab-1",
        openUiToast,
        onNavigate: vi.fn(),
        getStorage: () => localStorage,
        isSecureContext: () => true,
        getNotificationApi: () => Ctor,
      });

      const payload = samplePayload({ dedupeKey: `evt:${perm}` });
      await adapter.notify(payload);

      expect(created).toHaveLength(0);
      expect(openUiToast).toHaveBeenCalledWith(payload, expectedExtra);
    }

    localStorage.clear();
    const openUiToast = vi.fn();
    const adapter = new BrowserNotificationAdapter({
      tabId: "tab-1",
      openUiToast,
      onNavigate: vi.fn(),
      getStorage: () => localStorage,
      isSecureContext: () => false,
      getNotificationApi: () => undefined,
    });
    const payload = samplePayload({ dedupeKey: "evt:unsupported" });
    await adapter.notify(payload);
    expect(openUiToast).toHaveBeenCalledWith(payload, "none");
  });
});

describe("DesktopNotificationAdapter", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses system notification via desktop bridge without opening UI toast", async () => {
    const showMessageNotice = vi.fn().mockResolvedValue(true);
    const openUiToast = vi.fn();
    let clickHandler: ((path: string) => void) | null = null;

    const adapter = new DesktopNotificationAdapter({
      bridge: {
        showMessageNotice,
        onMessageNoticeOpen: (cb) => {
          clickHandler = cb;
          return () => {
            clickHandler = null;
          };
        },
      },
      tabId: "win-1",
      openUiToast,
      getStorage: () => localStorage,
      focusWindow: vi.fn(),
    });

    const payload = samplePayload();
    await adapter.notify(payload);

    expect(showMessageNotice).toHaveBeenCalledWith({
      title: "助手 等待你的审批",
      body: "执行终端命令",
      path: "/chat/agent_1/thr_1",
      tag: "dash-hitl:thr_1",
    });
    expect(openUiToast).not.toHaveBeenCalled();

    const opened: string[] = [];
    const unsub = adapter.subscribeOpen((path) => opened.push(path));
    clickHandler?.("/chat/agent_1/thr_1");
    clickHandler?.("https://evil.example/chat/a/b");
    expect(opened).toEqual(["/chat/agent_1/thr_1"]);
    unsub();
  });

  it("falls back to UI library notification only when OS notification is unsupported", async () => {
    const showMessageNotice = vi.fn().mockResolvedValue(false);
    const openUiToast = vi.fn();

    const adapter = new DesktopNotificationAdapter({
      bridge: { showMessageNotice },
      tabId: "win-1",
      openUiToast,
      getStorage: () => localStorage,
    });

    const payload = samplePayload();
    await adapter.notify(payload);

    expect(showMessageNotice).toHaveBeenCalledTimes(1);
    expect(openUiToast).toHaveBeenCalledWith(payload, "none");
  });
});
