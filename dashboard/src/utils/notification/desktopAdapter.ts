import type { OctopDesktopBridge } from "../desktopBridge";
import { claimSystemPush, isDashboardPushPath } from "../dashboardPushToast";
import type {
  AgentNoticePayload,
  NotificationAdapter,
  OpenUiToastFn,
} from "./types";

export interface DesktopAdapterDeps {
  bridge: Pick<OctopDesktopBridge, "showMessageNotice" | "onMessageNoticeOpen">;
  tabId: string;
  openUiToast: OpenUiToastFn;
  getStorage?: () => Storage | null;
  focusWindow?: () => void;
}

/**
 * Desktop client carrier adapter:
 * Delegates to the Electron shell's OS system notification (`showMessageNotice`).
 * Falls back to the UI library notification only when the OS notification sink
 * is unavailable or refuses the notice.
 */
export class DesktopNotificationAdapter implements NotificationAdapter {
  readonly carrier = "desktop" as const;
  private readonly deps: DesktopAdapterDeps;

  constructor(deps: DesktopAdapterDeps) {
    this.deps = deps;
  }

  async notify(payload: AgentNoticePayload): Promise<void> {
    const storage = this.deps.getStorage?.() ?? null;
    if (!claimSystemPush(storage, payload.dedupeKey, this.deps.tabId)) {
      return;
    }
    const showNotice = this.deps.bridge.showMessageNotice;
    if (typeof showNotice !== "function") {
      this.deps.openUiToast(payload, "none");
      return;
    }
    try {
      const result = await showNotice({
        title: payload.title,
        body: payload.body,
        path: payload.path,
        tag: payload.tag,
      });
      if (result === false) {
        this.deps.openUiToast(payload, "none");
      }
    } catch {
      this.deps.openUiToast(payload, "none");
    }
  }

  subscribeOpen(onOpen: (path: string) => void): () => void {
    const subscribe = this.deps.bridge.onMessageNoticeOpen;
    if (typeof subscribe !== "function") return () => undefined;
    return subscribe((path) => {
      if (!isDashboardPushPath(path)) return;
      (this.deps.focusWindow ?? (() => window.focus()))();
      onOpen(path);
    });
  }
}
