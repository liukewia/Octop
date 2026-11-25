/**
 * Shared IPC contract between main and preload. The renderer only ever sees the
 * typed ``window.octopDesktop`` bridge; raw ``ipcRenderer`` is never exposed.
 */

export type ConnectionMode = "local" | "remote";

export interface RemoteServerEntry {
  /** Normalized remote Octop server URL (origin + optional base path). */
  url: string;
  /** Human-readable name shown in menus; defaults to host. */
  label: string;
  /** Epoch ms when this server was last selected. */
  lastUsedAt?: number;
}

export interface ConnectionState {
  mode: ConnectionMode;
  /** Active remote server URL when mode === "remote", otherwise null. */
  remoteUrl: string | null;
  /** Recently used / saved remote servers, newest first. */
  savedServers: RemoteServerEntry[];
}

export interface ClientSettings {
  /** Launch at login / open at login. */
  launchAtLogin: boolean;
  /**
   * When the login item starts the app, leave the window hidden until the
   * user opens it from the Dock or tray. A normal launch still shows it.
   */
  launchWithoutWindow: boolean;
  /** Close-window behaviour: quit vs. keep in tray. */
  closeBehavior: "quit" | "tray";
  /**
   * Device light/dark preference shared with the Dashboard (`system` follows
   * the OS). The Early Window paints from this; the page reports changes back.
   */
  themeBackground: "system" | "light" | "dark";
  /** Whether the shell update check should follow the stable channel only. */
  stableOnly: boolean;
  /** Local C/S sidecar mode vs. remote thin-client mode. */
  connectionMode: ConnectionMode;
  /** Active remote server URL when connectionMode === "remote". */
  remoteServerUrl: string | null;
  /** Saved remote server bookmarks for quick switching. */
  savedRemoteServers: RemoteServerEntry[];
}

export interface PlatformInfo {
  platform: "darwin" | "win32" | "linux";
  arch: string;
  isDesktop: true;
}

export interface UpdateCheckResult {
  status: "update-available" | "up-to-date" | "error";
  currentVersion: string;
  latestVersion: string | null;
  error: string | null;
}

/**
 * Shell-owned update progress. ``installing`` means the downloaded package is
 * being opened. ``ready`` means the system installer window is up and this
 * process is still running, which is the unsigned macOS dmg path.
 */
export type UpdateActivity =
  | { phase: "idle" }
  | { phase: "downloading"; percent: number | null; received: number; total: number }
  | { phase: "ready" }
  | { phase: "installing" };

/** A JWT minted by the shell from the stored device credential. */
export interface IssuedSession {
  access_token: string;
  expires_in: number;
}

/**
 * Loopback WebSocket relay (§5.2). A custom scheme cannot carry a handshake,
 * so the page dials this instead of ``octop://app/api/…``.
 */
export interface WsRelayEndpoint {
  /** ``ws://127.0.0.1:<port>/<token>`` — append ``/api/…`` to it. */
  baseUrl: string;
  /** Random per-launch path segment; the relay refuses every other path. */
  token: string;
}

/** Theme for the *native* window controls (traffic lights / caption buttons). */
export interface WindowChromeTheme {
  /** Resolved mode the page is showing. */
  mode: "light" | "dark";
  /** The user's preference; kept so "system" keeps following the OS. */
  scheme?: "system" | "light" | "dark";
}

export const IPC_CHANNELS = {
  getPlatformInfo: "octop:get-platform-info",
  openDirectoryPicker: "octop:open-directory-picker",
  openFilePicker: "octop:open-file-picker",
  onBackendReady: "octop:backend-ready",
  windowChromeTheme: "octop:window-chrome-theme",
  windowChromeFullscreen: "octop:window-chrome-fullscreen",
  clientSettingsGet: "octop:client-settings:get",
  clientSettingsSet: "octop:client-settings:set",
  wsEndpoint: "octop:ws-endpoint",
  checkForUpdates: "octop:check-for-updates",
  /** Page already confirmed. No arguments: the shell re-selects the release and downloads it. */
  installUpdate: "octop:install-update",
  /** Current download / ready / install phase. The page also receives pushes. */
  updateActivity: "octop:update-activity",
  updateActivityChanged: "octop:update-activity-changed",
  /** Open the package already downloaded. No arguments, no new download. */
  openInstaller: "octop:open-installer",
  windowsMenuModel: "octop:windows-menu:model",
  windowsMenuInvoke: "octop:windows-menu:invoke",
  /** Linux square caption buttons. No-op on the other platforms. */
  windowMinimize: "octop:window-minimize",
  windowToggleMaximize: "octop:window-toggle-maximize",
  windowClose: "octop:window-close",
  windowIsMaximized: "octop:window-is-maximized",
  windowMaximized: "octop:window-maximized",
  sessionRegister: "octop:session:register",
  sessionRenew: "octop:session:renew",
  sessionRevoke: "octop:session:revoke",
  connectionGet: "octop:connection:get",
  connectionSwitchLocal: "octop:connection:switch-local",
  connectionSwitchRemote: "octop:connection:switch-remote",
  connectionRemoveSaved: "octop:connection:remove-saved",
  connectionChanged: "octop:connection:changed",
  connectionOpenSwitcher: "octop:connection:open-switcher",
} as const;
