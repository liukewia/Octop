import {
  claimSystemPush,
  isDashboardPushPath,
  readSystemNotifyPermission,
} from "../dashboardPushToast";
import type {
  AgentNoticePayload,
  NotificationAdapter,
  OpenUiToastFn,
} from "./types";

export interface BrowserNotificationHandle {
  onclick: (() => void) | null;
  close(): void;
}

export interface BrowserNotificationConstructor {
  readonly permission: string;
  new (title: string, options?: NotificationOptions): BrowserNotificationHandle;
}

export interface BrowserServiceWorkerRegistrationLike {
  showNotification(title: string, options?: NotificationOptions): Promise<void>;
}

export interface BrowserServiceWorkerContainerLike {
  addEventListener(type: "message", listener: (event: Event) => void): void;
  removeEventListener(type: "message", listener: (event: Event) => void): void;
}

export interface BrowserAdapterDeps {
  tabId: string;
  openUiToast: OpenUiToastFn;
  onNavigate: (path: string) => void;
  getStorage?: () => Storage | null;
  getIconUrl?: () => string;
  isSecureContext?: () => boolean;
  getNotificationApi?: () => BrowserNotificationConstructor | undefined;
  peekServiceWorkerRegistration?: () => BrowserServiceWorkerRegistrationLike | null;
  getServiceWorkerContainer?: () =>
    | BrowserServiceWorkerContainerLike
    | undefined;
  focusWindow?: () => void;
}

/**
 * Browser carrier adapter:
 * - Permission `granted`: invokes Browser OS Notification (SW `showNotification`
 *   when ready, otherwise `new Notification`), without duplicating a UI toast.
 * - Permission `default` / `denied` / `unsupported`: falls back to the UI
 *   library notification (`openUiToast`).
 */
export class BrowserNotificationAdapter implements NotificationAdapter {
  readonly carrier = "browser" as const;
  private readonly deps: BrowserAdapterDeps;

  constructor(deps: BrowserAdapterDeps) {
    this.deps = deps;
  }

  async notify(payload: AgentNoticePayload): Promise<void> {
    const NotificationCtor = this.deps.getNotificationApi
      ? this.deps.getNotificationApi()
      : typeof Notification === "undefined"
      ? undefined
      : (Notification as unknown as BrowserNotificationConstructor);
    const secure = this.deps.isSecureContext
      ? this.deps.isSecureContext()
      : typeof window !== "undefined" && Boolean(window.isSecureContext);
    const permission = readSystemNotifyPermission(secure, NotificationCtor);

    if (permission !== "granted" || !NotificationCtor) {
      const storage = this.deps.getStorage?.() ?? null;
      if (!claimSystemPush(storage, payload.dedupeKey, this.deps.tabId)) {
        return;
      }
      this.deps.openUiToast(
        payload,
        permission === "default" ? "enable" : "none",
      );
      return;
    }

    const storage = this.deps.getStorage?.() ?? null;
    if (!claimSystemPush(storage, payload.dedupeKey, this.deps.tabId)) {
      return;
    }

    const options: NotificationOptions & { renotify?: boolean } = {
      body: payload.body,
      tag: payload.tag,
      ...(this.deps.getIconUrl ? { icon: this.deps.getIconUrl() } : {}),
      renotify: true,
      data: { path: payload.path },
    };

    const swReg = this.deps.peekServiceWorkerRegistration?.() ?? null;
    if (swReg) {
      try {
        await swReg.showNotification(payload.title, options);
        return;
      } catch {
        // Fall through to the Notification constructor below.
      }
    }

    if (!this.openViaConstructor(NotificationCtor, payload, options)) {
      this.deps.openUiToast(payload, "none");
    }
  }

  subscribeOpen(onOpen: (path: string) => void): () => void {
    const sw = this.deps.getServiceWorkerContainer
      ? this.deps.getServiceWorkerContainer()
      : typeof navigator !== "undefined"
      ? navigator.serviceWorker
      : undefined;
    if (!sw) return () => undefined;

    const listener = (event: Event) => {
      const data = (event as MessageEvent).data as {
        type?: string;
        path?: string;
      } | null;
      if (!data || data.type !== "octop-notify-open" || !data.path) return;
      if (!isDashboardPushPath(data.path)) return;
      (this.deps.focusWindow ?? (() => window.focus()))();
      onOpen(data.path);
    };
    sw.addEventListener("message", listener);
    return () => {
      sw.removeEventListener("message", listener);
    };
  }

  private openViaConstructor(
    NotificationCtor: BrowserNotificationConstructor,
    payload: AgentNoticePayload,
    options: NotificationOptions,
  ): boolean {
    try {
      const handle = new NotificationCtor(payload.title, options);
      handle.onclick = () => {
        (this.deps.focusWindow ?? (() => window.focus()))();
        handle.close();
        this.deps.onNavigate(payload.path);
      };
      return true;
    } catch {
      return false;
    }
  }
}
