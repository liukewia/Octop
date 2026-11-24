import type { OctopDesktopBridge } from "../desktopBridge";
import {
  BrowserNotificationAdapter,
  type BrowserAdapterDeps,
} from "./browserAdapter";
import { DesktopNotificationAdapter } from "./desktopAdapter";
import type { NotificationAdapter } from "./types";

export interface CreateNotificationAdapterOptions extends BrowserAdapterDeps {
  desktopBridge?: Pick<
    OctopDesktopBridge,
    "showMessageNotice" | "onMessageNoticeOpen"
  > | null;
}

/**
 * Select the carrier adapter for the current runtime:
 * - Electron desktop client (`desktopBridge` present) → `DesktopNotificationAdapter`
 * - Web browser → `BrowserNotificationAdapter`
 */
export function createNotificationAdapter(
  options: CreateNotificationAdapterOptions,
): NotificationAdapter {
  if (options.desktopBridge) {
    return new DesktopNotificationAdapter({
      bridge: options.desktopBridge,
      tabId: options.tabId,
      openUiToast: options.openUiToast,
      getStorage: options.getStorage,
      focusWindow: options.focusWindow,
    });
  }
  return new BrowserNotificationAdapter(options);
}
