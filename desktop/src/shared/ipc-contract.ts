/**
 * Shared IPC contract between main and preload. The renderer only ever sees the
 * typed ``window.octopDesktop`` bridge; raw ``ipcRenderer`` is never exposed.
 */

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
  /** Page already confirmed. No arguments: the shell re-selects the release. */
  installUpdate: "octop:install-update",
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
  /** Synchronous: the Dashboard reads this before its first render. */
  sessionTakeRemote: "octop:session:take-remote",
  connectionGet: "octop:connection:get",
  connectionSet: "octop:connection:set",
  connectionClear: "octop:connection:clear",
  connectionConnect: "octop:connection:connect",
  connectionOpenForm: "octop:connection:open-form",
  connectionUseLocal: "octop:connection:use-local",
  connectionLoginRemote: "octop:connection:login-remote",
  connectionRelaunch: "octop:connection:relaunch",
  /** The application menu asked this dashboard to open the cloud-instance dialog. */
  connectionOpenMenu: "octop:connection:open-menu",
  /** Synchronous: wipe the previous origin's JWT before the page boots. */
  connectionConsumeReset: "octop:connection:consume-reset",
} as const;

export interface ConnectionView {
  mode: "local" | "remote";
  origin: string;
  username: string;
  hasPassword: boolean;
  versionWarning: string | null;
}

export interface RemoteMfaChallenge {
  mfa_required: true;
  mfa_token: string;
  methods: string[];
  user_hint: string;
  locale: string;
}

export type RemoteHandoff =
  | { kind: "token"; access_token: string; expires_in: number }
  | { kind: "mfa"; username: string; challenge: RemoteMfaChallenge }
  | { kind: "captcha"; username: string };

export interface ConnectionWriteResult {
  ok: boolean;
  error?: string;
  detail?: string;
}
