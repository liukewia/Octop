import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  screen,
  shell,
  Tray,
  type NativeImage,
  type WebContents,
} from "electron";
import { execFileSync, spawn } from "node:child_process";
import { constants as fsConstants, existsSync, mkdirSync, promises as fs, rmSync, writeFileSync } from "node:fs";
import { type as osType, release as osRelease } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  IPC_CHANNELS,
  type ClientSettings,
  type ConnectionState,
  type IssuedSession,
  type PlatformInfo,
  type UpdateActivity,
  type UpdateCheckResult,
} from "../shared/ipc-contract";
import { encodeShellError, SHELL_ERROR_PARAM, type ShellFailure } from "../shared/shell-error";
import { changeShellLanguage, shellT } from "../shared/shell-i18n";
import {
  isInsecureRemoteUrl,
  normalizeRemoteServerUrl,
  remoteServerEntryUrl,
  removeSavedServer,
  serverOriginOf,
  upsertSavedServer,
} from "./connection/server-target";
import { resolveAppVersion } from "./app-version";
import { desktopLog, installDesktopLog } from "./log/desktop-log";
import { DeviceCredentialStore } from "./session/device-credential";
import { DeviceSessionClient } from "./session/device-session";
import { safeStorageCipher, warnIfKeychainUnavailable } from "./session/safe-storage-cipher";
import { ClientSettingsStore, defaultClientSettingsPath } from "./storage/client-settings";
import { readLoginShellEnv, resolveOctopHome } from "./supervisor/shell-env";
import { reserveRandomPort } from "./supervisor/random-port";
import {
  bundledDashboardDir,
  classifyRuntime,
  portableZipName,
  extractPortableZip,
  installedRuntimeDir,
  type BundledPortable,
  type LocalRuntime,
} from "./supervisor/runtime-extractor";
import { compareVersions } from "./supervisor/version";
import { sha256File } from "./supervisor/sha256";
import { buildSidecarEnv } from "./supervisor/process-tree";
import { SidecarSupervisor } from "./supervisor/sidecar";
import { contentTypeFor, isExternalLink, resolveDashboardFile, resolveStaticPath } from "./protocol/static-handler";
import { isApiPath, sanitizeForwardHeaders, toBackendUrl } from "./protocol/stream-proxy";
import { WsRelay } from "./protocol/ws-relay";
import {
  channelHeadTag,
  isValidAssetUrl,
  manifestFromDownloadsResponse,
  platformAssetKey,
  selectRelease,
  type DownloadManifest,
  type SelectedRelease,
} from "./update/update-coordinator";
import { downloadToFile } from "./update/download";
import {
  fetchUpdatePackage,
  type InstallerKind,
  type InstallOutcome,
} from "./update/installer";
import {
  dashboardDevOrigin,
  readDashboardDev,
  startDashboardDevServer,
  stopDashboardDevServer,
} from "./dev/dashboard-dev-server";
import {
  formatAboutDetail,
  formatAboutOs,
  resolveGitStamp,
  windowsInstallScope,
} from "./windows/about-info";
import {
  macApplicationMenu,
  windowsApplicationMenu,
  windowsMenuCommandId,
  windowsMenuModel,
  type AppMenuHandlers,
  type WindowsMenuCommandId,
} from "./windows/app-menu";
import { createEarlyWindow, setBeforeRelaunchHook } from "./windows/early-window";
import {
  commitLoginItem,
  linuxAutostartDir,
  planLoginItem,
  shouldStartHidden,
} from "./windows/login-item";
import { createMainWindow, installDashboardGuards } from "./windows/main-window";
import type { EarlyWindow } from "./windows/early-window";
import { isWindowOnScreen, presentWindows, shouldKeepWindowOnClose } from "./windows/present";
import {
  shouldInstallSystemTray,
  trayExecutableFallback,
  trayIconCandidates,
  trayIconImagePath,
  trayMenuLabels,
  WINDOWS_APP_USER_MODEL_ID,
} from "./windows/tray";
import {
  applyNativeTheme,
  applyWindowChromeTheme,
  dashboardEntryUrl,
  PACKAGED_APP_ORIGIN,
  parseWindowChromeTheme,
  resolveWindowChromeTheme,
  usesCaptionOverlay,
  windowBackground,
} from "./windows/chrome";

const UPDATE_ENDPOINT = "https://octop.cloud/api/downloads";
// Packaged renderer origin. Local dev replaces this with the Vite origin before
// the relay starts, and the relay accepts upgrades only from that origin (§5.2).
const WINDOW_ORIGIN = "octop://app";
const PRELOAD_PATH = join(__dirname, "../preload/index.js");
const SPLASH_PATH = join(__dirname, "../renderer/splash.html");
const ERROR_PATH = join(__dirname, "../renderer/error.html");

interface PortableManifestFile {
  version: string;
  sha256: string;
}

let supervisor: SidecarSupervisor | null = null;
let settingsStore: ClientSettingsStore;
// §7 accounts: renews the Dashboard session without a password. Registered by
// the renderer once it holds a JWT; used whenever that JWT has expired.
let deviceSession: DeviceSessionClient | null = null;
// Resolved after `whenReady` — `app.getVersion()` must not run at module load.
let appVersion = "";
// §6.3 step 1: once an install is under way the proxy answers 503 so no new API
// request is admitted while Python shuts down.
let apiAdmissionClosed = false;
let updateInFlight = false;
let quitting = false;
// Default matches ClientSettingsStore. Boot and the settings IPC keep it current.
let closeBehavior: "quit" | "tray" = "tray";
// Windows notification area. Null until the icon is actually on screen.
let tray: Tray | null = null;
// Kept for the life of the tray. A resized bitmap is dropped from the
// notification area once the window hides, and a collected image goes blank.
let trayIcon: NativeImage | null = null;
// Set once the Dashboard has opened, so a later Dock click can open it again.
let dashboardOrigin: string | null = null;
let activeConnectionMode: "local" | "remote" = "local";
let activeRemoteUrl: string | null = null;
let octopHomeDir = "";
let protocolRegistered = false;
let protocolStaticRoot = "";
let ipcHandlersRegistered = false;
let switchingConnection = false;
// Current loopback port of the sidecar. Read per request (not captured), so a
// restart after a failed install can hand the proxy a new port.
let backendPort = 0;
// §5.2: WebSockets cannot ride the custom scheme, so the page dials this relay.
let wsRelay: WsRelay | null = null;
// Everything needed to (re)spawn the sidecar for this launch.
let backend: {
  interpreter: string;
  launchScript: string;
  cwd: string;
  octopHome: string;
  portableDir: string;
} | null = null;

// A custom scheme used as the renderer origin must be declared privileged
// BEFORE the app is ready, otherwise `octop://app/` is not treated as a
// standard/secure origin and fetch/XHR/CORS break.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "octop",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

function resourcesRoot(): string {
  return app.isPackaged ? process.resourcesPath : join(__dirname, "../../resources");
}

function dashboardRoot(portableDir: string): string {
  const override = (process.env.OCTOP_DASHBOARD_DIR ?? "").trim();
  if (override) return override;
  return bundledDashboardDir(portableDir);
}

/** Map to the green-pack naming used by desktop/portable (`darwin-arm64`, …). */
function portablePlatformTag(): string {
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  if (process.platform === "darwin") return `darwin-${arch}`;
  if (process.platform === "win32") return `windows-${arch}`;
  return `linux-${arch}`;
}

function portableZipPath(): string {
  // CI places one zip at resources/portable.
  return join(resourcesRoot(), "portable", portableZipName(portablePlatformTag(), appVersion));
}

async function readBundledPortable(): Promise<BundledPortable> {
  const manifest = JSON.parse(
    await fs.readFile(join(resourcesRoot(), "portable", "portable-version.json"), "utf8"),
  ) as PortableManifestFile;
  return { version: manifest.version, sha256: manifest.sha256 };
}

async function readLocalRuntime(octopHome: string): Promise<LocalRuntime> {
  const versionPath = join(octopHome, "portable", "version.json");
  let version: string | null = null;
  try {
    const raw = JSON.parse(await fs.readFile(versionPath, "utf8")) as { version?: unknown };
    version = typeof raw.version === "string" ? raw.version : null;
  } catch {
    version = null;
  }
  const interpreterPath = join(octopHome, "portable", "runtime", process.platform === "win32" ? "python.exe" : "bin/python3");
  let interpreterExists = false;
  try {
    // X_OK, not F_OK. A previous extract could leave `python3` as a mode-0666
    // text file where the archive stored a symlink. The path exists, spawn
    // fails with EACCES, and a same-version launch would otherwise skip
    // extraction forever. On Windows X_OK is the same check as F_OK.
    await fs.access(interpreterPath, fsConstants.X_OK);
    interpreterExists = true;
  } catch {
    interpreterExists = false;
  }
  return { version, interpreterExists };
}

/**
 * The one product version (shell + Dashboard + runtime share a release). Read
 * the bundled portable manifest first, then the dev runtime, and only then fall
 * back to `package.json` — see `app-version.ts` for why the placeholder there
 * must not win.
 */
async function resolveProductVersion(): Promise<string> {
  return resolveAppVersion({
    readBundled: async () => (await readBundledPortable()).version,
    readDevRuntime: async () => {
      const dir = (process.env.OCTOP_PORTABLE_DIR ?? "").trim();
      if (!dir) return null;
      const raw = JSON.parse(await fs.readFile(join(dir, "version.json"), "utf8")) as {
        version?: unknown;
      };
      return typeof raw.version === "string" ? raw.version : null;
    },
    readPackage: () => app.getVersion(),
  });
}

async function writeLocalVersion(octopHome: string, version: string): Promise<void> {
  const dir = join(octopHome, "portable");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, "version.json"), JSON.stringify({ version, sha256: "" }, null, 2), "utf8");
}

function registerProtocol(staticRootDir: string): void {
  protocolStaticRoot = staticRootDir;
  if (protocolRegistered) return;
  protocolRegistered = true;
  protocol.handle("octop", async (request) => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (isApiPath(pathname)) {
      if (apiAdmissionClosed || !backendPort) return new Response("service unavailable", { status: 503 });
      const target = toBackendUrl(backendPort, pathname, url.search);
      const headers = sanitizeForwardHeaders(request.headers);
      headers["x-octop-proxy"] = "1";
      return net.fetch(target, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        // @ts-expect-error duplex is required for streaming request bodies in undici
        duplex: "half",
      });
    }

    // Escape stays forbidden. A client route with no file falls back to
    // index.html; otherwise View → Reload of /chat returns an empty page.
    if (!protocolStaticRoot || !resolveStaticPath(protocolStaticRoot, pathname)) {
      return new Response("forbidden", { status: 403 });
    }
    const filePath = resolveDashboardFile(protocolStaticRoot, pathname, existsSync);
    if (!filePath) return new Response("not found", { status: 404 });
    // Serve via file URL so large assets stream instead of buffering in memory.
    return net.fetch(pathToFileURL(filePath).toString()).then((res) => {
      const out = new Response(res.body, { status: res.status, headers: res.headers });
      if (!out.headers.get("content-type")) out.headers.set("content-type", contentTypeFor(filePath));
      return out;
    });
  });
}

async function fetchUpdateManifest(): Promise<{ manifest: DownloadManifest; stableOnly: boolean }> {
  const settings = settingsStore.load();
  const res = await net.fetch(UPDATE_ENDPOINT, { cache: "no-store" });
  if (!res.ok) throw new Error(`downloads endpoint returned ${res.status}`);
  return {
    manifest: manifestFromDownloadsResponse(await res.json()),
    stableOnly: settings.stableOnly,
  };
}

async function resolveSelectedRelease(): Promise<SelectedRelease | null> {
  const { manifest, stableOnly } = await fetchUpdateManifest();
  return selectRelease(
    manifest,
    appVersion,
    platformAssetKey(process.platform, process.arch),
    stableOnly,
  );
}

function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A JWT the shell will forward: non-empty, bounded, nothing else assumed. */
function isUsableAccessToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4096;
}

async function showShellMessage(
  win: BrowserWindow | null,
  message: string,
  detail: string,
): Promise<void> {
  const options = { type: "info" as const, buttons: [shellT("shell.ok")], message, detail, noLink: true };
  if (win) await dialog.showMessageBox(win, options);
  else await dialog.showMessageBox(options);
}

async function showShellError(
  win: BrowserWindow | null,
  message: string,
  detail: string,
): Promise<void> {
  const options = {
    type: "error" as const,
    buttons: [shellT("shell.ok")],
    message,
    detail,
    noLink: true,
  };
  if (win) await dialog.showMessageBox(win, options);
  else await dialog.showMessageBox(options);
}

/** Temp staging area for installers — never inside OCTOP_HOME (user data). */
function updateDownloadDir(): string {
  return join(app.getPath("temp"), "octop-update");
}

let updateActivity: UpdateActivity = { phase: "idle" };
let preparedUpdate: { kind: InstallerKind; path: string } | null = null;

function publishUpdate(next: UpdateActivity): void {
  updateActivity = next;
  for (const open of BrowserWindow.getAllWindows()) {
    if (!open.isDestroyed()) open.webContents.send(IPC_CHANNELS.updateActivityChanged, next);
  }
}

/** A download that finishes behind a hidden window asks for the user to come back. */
function attentionForReady(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed() || win.isVisible()) return;
  if (process.platform === "darwin") app.dock?.bounce("informational");
  else win.flashFrame(true);
}

async function handOffToInstaller(kind: InstallerKind, path: string): Promise<void> {
  if (kind === "appimage") await fs.chmod(path, 0o755);
  if (process.platform === "win32" && (kind === "exe" || kind === "msi")) {
    // NSIS/MSI must replace the running shell: start the installer detached and
    // let this process exit right after (§6.3 step 3).
    spawn(path, [], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  const failure = await shell.openPath(path);
  if (failure) throw new Error(failure);
}

async function prepareShellUpdate(
  win: BrowserWindow | null,
  selected: SelectedRelease,
): Promise<InstallOutcome> {
  preparedUpdate = null;
  publishUpdate({ phase: "downloading", percent: 0, received: 0, total: 0 });
  try {
    const dir = updateDownloadDir();
    // Start from an empty staging dir so an aborted earlier attempt cannot be
    // mistaken for (or re-used as) this download.
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    let lastEmit = 0;
    let lastPercent = -1;
    const outcome = await fetchUpdatePackage(selected, {
      download: async (plan) => {
        const dest = join(dir, plan.filename);
        await downloadToFile(plan.url, dest, net.fetch, {
          validateFinalUrl: isValidAssetUrl,
          onProgress: (received, total) => {
            const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null;
            const now = Date.now();
            const done = total > 0 && received >= total;
            if (!done && percent === lastPercent && now - lastEmit < 200) return;
            lastPercent = percent ?? -1;
            lastEmit = now;
            if (total > 0 && win && !win.isDestroyed()) win.setProgressBar(received / total);
            publishUpdate({ phase: "downloading", percent, received, total });
          },
        });
        return dest;
      },
      // §6.1 assets carry no digest; the URL is already pinned to https on
      // download.octop.cloud by isValidAssetUrl() before it reaches this point.
      verify: async () => true,
    });
    return outcome;
  } finally {
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
  }
}

/** Open the already downloaded package again. A dmg stays on screen for the user to drag. */
async function reopenDownloadedInstaller(): Promise<void> {
  const current = preparedUpdate;
  if (!current) return;
  await handOffToInstaller(current.kind, current.path);
}

function registerIpcHandlers(): void {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  ipcMain.handle(IPC_CHANNELS.getPlatformInfo, (): PlatformInfo => ({
    platform: process.platform as PlatformInfo["platform"],
    arch: process.arch,
    isDesktop: true,
  }));

  ipcMain.handle(IPC_CHANNELS.windowsMenuModel, () => {
    if (!usesCaptionOverlay()) return null;
    return windowsMenuModel(app.getLocale());
  });
  ipcMain.handle(IPC_CHANNELS.windowsMenuInvoke, (event, id: unknown) => {
    if (!usesCaptionOverlay()) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    const command = windowsMenuCommandId(id);
    if (!command) return;
    runWindowsMenuCommand(win, command);
  });

  ipcMain.on(IPC_CHANNELS.windowMinimize, (event) => {
    linuxCaptionWindow(event.sender)?.minimize();
  });
  ipcMain.on(IPC_CHANNELS.windowToggleMaximize, (event) => {
    const win = linuxCaptionWindow(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on(IPC_CHANNELS.windowClose, (event) => {
    linuxCaptionWindow(event.sender)?.close();
  });
  ipcMain.handle(IPC_CHANNELS.windowIsMaximized, (event): boolean => {
    return linuxCaptionWindow(event.sender)?.isMaximized() ?? false;
  });

  ipcMain.handle(IPC_CHANNELS.clientSettingsGet, (): ClientSettings => settingsStore.load());
  ipcMain.handle(IPC_CHANNELS.clientSettingsSet, (_e, patch: Partial<ClientSettings>) => {
    const saved = settingsStore.save(patch);
    closeBehavior = saved.closeBehavior;
    try {
      syncLoginItem(saved);
    } catch (err) {
      desktopLog().warn(
        `login item update failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return saved;
  });

  // Synchronous on purpose: the renderer builds WebSocket URLs inside render
  // paths and cannot await (§5.2). Answers null (never the sidecar port) while
  // no relay is listening.
  ipcMain.on(IPC_CHANNELS.wsEndpoint, (event) => {
    event.returnValue = wsRelay?.endpoint ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.checkForUpdates, async (): Promise<UpdateCheckResult> => {
    try {
      const { manifest, stableOnly } = await fetchUpdateManifest();
      const platform = platformAssetKey(process.platform, process.arch);
      // Channel head is what the page shows, even when it is not an upgrade.
      // The installable selection still has to be newer and carry a local asset.
      const listed = channelHeadTag(manifest, stableOnly);
      const selected = selectRelease(manifest, appVersion, platform, stableOnly);
      if (!selected) {
        return { status: "up-to-date", currentVersion: appVersion, latestVersion: listed, error: null };
      }
      return {
        status: "update-available",
        currentVersion: appVersion,
        latestVersion: selected.tag,
        error: null,
      };
    } catch (err) {
      return {
        status: "error",
        currentVersion: appVersion,
        latestVersion: null,
        error: errorMessageOf(err),
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.updateActivity, (): UpdateActivity => updateActivity);

  ipcMain.handle(IPC_CHANNELS.installUpdate, async (event) => {
    // The page already confirmed. Ignore every argument and re-select the
    // release here, so the renderer cannot name a package URL (§6.2).
    if (updateInFlight || updateActivity.phase === "installing") return;
    updateInFlight = true;
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0] ?? null;

    try {
      let selected: SelectedRelease | null;
      try {
        selected = await resolveSelectedRelease();
      } catch (err) {
        await showShellError(win, shellT("shell.updateCheckFailed"), errorMessageOf(err));
        return;
      }
      if (!selected) {
        preparedUpdate = null;
        publishUpdate({ phase: "idle" });
        await showShellMessage(win, shellT("shell.upToDateTitle"), shellT("shell.upToDate", { version: appVersion }));
        return;
      }

      const outcome = await prepareShellUpdate(win, selected);
      if (!outcome.ok) {
        preparedUpdate = null;
        publishUpdate({ phase: "idle" });
        await showShellError(win, shellT("shell.updateFailed"), outcome.message);
        return;
      }

      preparedUpdate = { kind: outcome.plan.kind, path: outcome.path };
      publishUpdate({ phase: "installing" });
      // An unsigned dmg cannot replace the running app. Leave this process up
      // and let the user finish in the Finder window we just opened.
      if (outcome.plan.kind === "dmg") {
        try {
          await handOffToInstaller(outcome.plan.kind, outcome.path);
        } catch (err) {
          preparedUpdate = null;
          publishUpdate({ phase: "idle" });
          await showShellError(win, shellT("shell.updateFailed"), errorMessageOf(err));
          return;
        }
        publishUpdate({ phase: "ready" });
        attentionForReady(win);
        return;
      }

      // Stop the relay and Python sidecar before handing off to OS installers
      // (especially Windows NSIS/MSI) so no background process holds file locks.
      apiAdmissionClosed = true;
      stopDashboardDevServer();
      await wsRelay?.stop().catch(() => undefined);
      await supervisor?.stop().catch(() => undefined);
      try {
        await handOffToInstaller(outcome.plan.kind, outcome.path);
      } catch (err) {
        apiAdmissionClosed = false;
        preparedUpdate = null;
        publishUpdate({ phase: "idle" });
        await showShellError(win, shellT("shell.updateFailed"), errorMessageOf(err));
        return;
      }
      quitting = true;
      app.quit();
    } finally {
      updateInFlight = false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.openDirectoryPicker, async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC_CHANNELS.openFilePicker, async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ["openFile"] })
      : await dialog.showOpenDialog({ properties: ["openFile"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC_CHANNELS.openInstaller, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0] ?? null;
    try {
      await reopenDownloadedInstaller();
    } catch (err) {
      await showShellError(win, shellT("shell.updateFailed"), errorMessageOf(err));
    }
  });

  ipcMain.handle(IPC_CHANNELS.sessionRegister, (_event, accessToken: unknown): Promise<boolean> => {
    if (activeConnectionMode !== "local" || !isUsableAccessToken(accessToken)) {
      return Promise.resolve(false);
    }
    return deviceSession?.register(accessToken) ?? Promise.resolve(false);
  });

  ipcMain.handle(IPC_CHANNELS.sessionRenew, (): Promise<IssuedSession | null> => {
    if (activeConnectionMode !== "local") return Promise.resolve(null);
    return deviceSession?.renew() ?? Promise.resolve(null);
  });

  ipcMain.handle(IPC_CHANNELS.sessionRevoke, (_event, accessToken: unknown): Promise<boolean> => {
    if (activeConnectionMode !== "local" || !isUsableAccessToken(accessToken)) {
      return Promise.resolve(false);
    }
    return deviceSession?.revoke(accessToken) ?? Promise.resolve(false);
  });

  ipcMain.handle(IPC_CHANNELS.connectionGet, (): ConnectionState => currentConnectionState());
  ipcMain.handle(IPC_CHANNELS.connectionSwitchLocal, async (event): Promise<ConnectionState> => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    return switchToLocal(win);
  });
  ipcMain.handle(
    IPC_CHANNELS.connectionSwitchRemote,
    async (event, payload: unknown): Promise<ConnectionState> => {
      const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const url = typeof record.url === "string" ? record.url : "";
      const label = typeof record.label === "string" ? record.label : undefined;
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      return switchToRemote(url, label, win);
    },
  );
  ipcMain.handle(IPC_CHANNELS.connectionRemoveSaved, (_event, url: unknown): ConnectionState => {
    if (typeof url !== "string" || !url.trim()) return currentConnectionState();
    const settings = settingsStore.load();
    const nextSaved = removeSavedServer(settings.savedRemoteServers, url);
    settingsStore.save({ savedRemoteServers: nextSaved });
    const next = currentConnectionState();
    broadcastConnectionState(next);
    return next;
  });

  // The page reports its theme so the native controls follow it; window buttons
  // themselves are native and never cross this bridge. The preference is also
  // the device setting the next Early Window paints from — the splash cannot
  // read the Dashboard's localStorage.
  ipcMain.on(IPC_CHANNELS.windowChromeTheme, (event, theme: unknown) => {
    const parsed = parseWindowChromeTheme(theme);
    if (!parsed) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) applyWindowChromeTheme(win, parsed);
    if (parsed.scheme && settingsStore.load().themeBackground !== parsed.scheme) {
      settingsStore.save({ themeBackground: parsed.scheme });
    }
  });
}

/** Append the desktop log path so a packaged failure says where to look. */
function errorDetail(detail?: string): string | undefined {
  const path = desktopLog().path;
  const text = [detail, path ? shellT("shell.logPath", { path }) : ""].filter((line) => line).join("\n");
  return text || undefined;
}

/** Spawn the Python sidecar on a fresh loopback port and wait for health. */
async function startBackend(): Promise<boolean> {
  if (!backend) return false;
  const port = await reserveRandomPort();
  const env = buildSidecarEnv(process.env, {
    octopHome: backend.octopHome,
    portableDir: backend.portableDir,
    port,
    bindHost: "127.0.0.1",
  });
  backendPort = port;
  const sidecar = new SidecarSupervisor({
    executable: backend.interpreter,
    args: [backend.launchScript, "run"],
    env,
    cwd: backend.cwd,
    port,
    onExit: ({ code, signal, output }) => {
      const summary = `sidecar exited code=${code ?? "null"} signal=${signal ?? "null"}`;
      // A clean exit, or a stop this shell already asked for, is not a crash.
      if (quitting || (code === 0 && signal === null)) {
        desktopLog().info(summary);
        return;
      }
      desktopLog().error(summary);
      const tail = output.trim();
      if (tail) desktopLog().error(tail);
    },
  });
  supervisor = sidecar;
  desktopLog().info(`starting sidecar on 127.0.0.1:${port}`);
  sidecar.start();
  const ready = await sidecar.waitUntilReady();
  if (!ready) {
    desktopLog().error(`sidecar was not ready on 127.0.0.1:${port}`);
    // The exit handler already kept the tail when the process died. A timeout
    // leaves it running, so that tail still has to be written from here.
    if (sidecar.isRunning()) {
      const tail = sidecar.outputTail().trim();
      if (tail) desktopLog().error(tail);
    }
  }
  return ready;
}

function openExternal(url: string): void {
  if (isExternalLink(url)) void shell.openExternal(url);
}

/** Close-to-tray and the "backend ready" signal. Shared by the first window and a later one. */
function watchDashboardLifetime(win: BrowserWindow): void {
  win.on("close", (event) => {
    if (
      !shouldKeepWindowOnClose({
        platform: process.platform,
        closeBehavior,
        quitting,
        trayReady: tray !== null,
      })
    ) {
      return;
    }
    // Hide instead of destroy. macOS comes back from the Dock; Windows and
    // Linux come back from the tray icon. The next click shows this same
    // window rather than a fresh load.
    event.preventDefault();
    win.hide();
    // Hiding the last window makes Windows drop a bitmap tray icon. Put the
    // same image back so the notification area still has a way to reopen.
    if (tray && trayIcon && !tray.isDestroyed()) tray.setImage(trayIcon);
  });
  win.webContents.on("did-finish-load", () => {
    if (win.isDestroyed()) return;
    win.webContents.send(IPC_CHANNELS.onBackendReady, { ok: true });
  });
}

/** Linux page-drawn caption buttons. Other platforms keep the native ones. */
function linuxCaptionWindow(sender: WebContents): BrowserWindow | null {
  if (process.platform !== "linux") return null;
  const win = BrowserWindow.fromWebContents(sender);
  if (!win || win.isDestroyed()) return null;
  return win;
}

/** Tell the page when maximize flips, so the glyph can switch to restore. */
function watchLinuxCaptionState(win: BrowserWindow): void {
  if (process.platform !== "linux") return;
  const publish = () => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send(IPC_CHANNELS.windowMaximized, win.isMaximized());
  };
  win.on("maximize", publish);
  win.on("unmaximize", publish);
}

function currentConnectionState(): ConnectionState {
  const settings = settingsStore.load();
  return {
    mode: settings.connectionMode,
    remoteUrl: settings.connectionMode === "remote" ? settings.remoteServerUrl : null,
    savedServers: settings.savedRemoteServers,
  };
}

function broadcastConnectionState(state: ConnectionState): void {
  installAppMenu(appVersion);
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
    win.webContents.send(IPC_CHANNELS.connectionChanged, state);
  }
}

function requestOpenConnectionSwitcher(win?: BrowserWindow): void {
  const target =
    (win && !win.isDestroyed() ? win : null) ??
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ??
    null;
  if (!target || target.isDestroyed() || target.webContents.isDestroyed()) return;
  target.show();
  target.focus();
  target.webContents.send(IPC_CHANNELS.connectionOpenSwitcher);
}

function showWindowError(win: BrowserWindow, failure: ShellFailure): void {
  if (win.isDestroyed()) return;
  const chromeTheme = resolveWindowChromeTheme(settingsStore.load().themeBackground);
  const payload = encodeShellError({ ...failure, version: appVersion });
  void win.loadFile(ERROR_PATH, {
    query: { [SHELL_ERROR_PARAM]: payload, theme: chromeTheme.mode },
  });
}

function entryUrlForTarget(targetUrl: string): string {
  const chromeTheme = resolveWindowChromeTheme(settingsStore.load().themeBackground);
  const scheme = chromeTheme.scheme ?? chromeTheme.mode;
  if (activeConnectionMode === "remote" && activeRemoteUrl) {
    return remoteServerEntryUrl(scheme, activeRemoteUrl);
  }
  return dashboardEntryUrl(scheme, targetUrl);
}

function handleWindowLoadFail(win: BrowserWindow, failedUrl: string, errorDescription: string): void {
  if (activeConnectionMode !== "remote" || !activeRemoteUrl) return;
  desktopLog().warn(`remote server load failed url=${failedUrl} reason=${errorDescription}`);
  showWindowError(win, {
    message: shellT("shell.remoteLoadFailed", { url: activeRemoteUrl }),
    detail: errorDetail(shellT("shell.remoteLoadFailedDetail", { reason: errorDescription })),
  });
}

function openDashboardWindow(appOrigin: string): BrowserWindow {
  dashboardOrigin = appOrigin;
  const chromeTheme = resolveWindowChromeTheme(settingsStore.load().themeBackground);
  const win = createMainWindow({
    preload: PRELOAD_PATH,
    theme: chromeTheme,
    backgroundColor: windowBackground(chromeTheme.mode),
    entryUrl: entryUrlForTarget(appOrigin),
    appOrigin: () => dashboardOrigin ?? PACKAGED_APP_ORIGIN,
    onNavigate: openExternal,
    onLoadFail: (failedUrl, reason) => handleWindowLoadFail(win, failedUrl, reason),
  });
  watchDashboardLifetime(win);
  watchLinuxCaptionState(win);
  return win;
}

/** Keep the splash window and load the Dashboard into it. */
function continueInEarlyWindow(early: EarlyWindow, appOrigin: string): void {
  dashboardOrigin = appOrigin;
  const win = early.browserWindow;
  if (win.isDestroyed()) {
    openDashboardWindow(appOrigin);
    return;
  }
  installDashboardGuards(win, {
    appOrigin: () => dashboardOrigin ?? PACKAGED_APP_ORIGIN,
    onNavigate: openExternal,
    onLoadFail: (failedUrl, reason) => handleWindowLoadFail(win, failedUrl, reason),
  });
  watchDashboardLifetime(win);
  void win.loadURL(entryUrlForTarget(appOrigin));
}

/**
 * Windows will not raise a window that was hidden while another app was
 * active. Briefly pinning it forces the foreground, then releases it.
 */
function raiseHiddenWindows(windows: readonly BrowserWindow[]): void {
  if (process.platform !== "win32") return;
  for (const win of windows) {
    if (win.isDestroyed()) continue;
    win.setAlwaysOnTop(true);
    win.show();
    win.focus();
    win.setAlwaysOnTop(false);
  }
}

/** Dock click, tray click, and a second launch. Show what is already open, or open it. */
function revealAppWindow(): void {
  if (quitting) return;
  const windows = BrowserWindow.getAllWindows();
  if (presentWindows(windows) > 0) {
    // The click is the user asking for this app. Steal so a hidden window
    // comes forward even when another app was active.
    app.focus({ steal: true });
    raiseHiddenWindows(windows);
    const areas = screen.getAllDisplays().map((display) => display.workArea);
    if (areas.length === 0) return;
    for (const win of windows) {
      if (win.isDestroyed()) continue;
      if (!isWindowOnScreen(win.getBounds(), areas)) win.center();
    }
    return;
  }
  if (dashboardOrigin) openDashboardWindow(dashboardOrigin);
}

function showAboutDialog(version: string): void {
  const locale = app.getLocale();
  const stamp = resolveGitStamp(readGitStamp, {
    commit: process.env.OCTOP_GIT_COMMIT,
    date: process.env.OCTOP_GIT_DATE,
  });
  void dialog.showMessageBox({
    type: "info",
    title: locale.toLowerCase().startsWith("zh") ? "关于 Octop" : "About Octop",
    message: "Octop",
    detail: formatAboutDetail({
      version,
      setup: process.platform === "win32" ? windowsInstallScope(process.execPath) : null,
      commit: stamp.commit,
      date: stamp.date,
      electron: process.versions.electron ?? "",
      chromium: process.versions.chrome ?? "",
      node: process.versions.node ?? "",
      v8: process.versions.v8 ?? "",
      os: formatAboutOs(osType(), process.arch, osRelease()),
    }),
  });
}

/** Run one caption-menu command. Roles stay on the native menu for accelerators. */
function runWindowsMenuCommand(win: BrowserWindow, command: WindowsMenuCommandId): void {
  const contents = win.webContents;
  switch (command) {
    case "connectionSettings":
      requestOpenConnectionSwitcher(win);
      return;
    case "close":
      win.close();
      return;
    case "quit":
      app.quit();
      return;
    case "undo":
      contents.undo();
      return;
    case "redo":
      contents.redo();
      return;
    case "cut":
      contents.cut();
      return;
    case "copy":
      contents.copy();
      return;
    case "paste":
      contents.paste();
      return;
    case "delete":
      contents.delete();
      return;
    case "selectAll":
      contents.selectAll();
      return;
    case "reload":
      contents.reload();
      return;
    case "forceReload":
      contents.reloadIgnoringCache();
      return;
    case "toggleDevTools":
      contents.toggleDevTools();
      return;
    case "resetZoom":
      contents.setZoomLevel(0);
      return;
    case "zoomIn":
      contents.setZoomLevel(contents.getZoomLevel() + 1);
      return;
    case "zoomOut":
      contents.setZoomLevel(contents.getZoomLevel() - 1);
      return;
    case "togglefullscreen":
      win.setFullScreen(!win.isFullScreen());
      return;
    case "about":
      showAboutDialog(appVersion);
      return;
  }
}

/** Install native application menu on macOS and Windows/Linux. */
function installAppMenu(version: string): void {
  const handlers: AppMenuHandlers = {
    onAbout: () => showAboutDialog(version),
    onConnectionSettings: () => requestOpenConnectionSwitcher(),
  };
  if (usesCaptionOverlay()) {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(windowsApplicationMenu(app.getLocale(), handlers)),
    );
    return;
  }
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(macApplicationMenu(app.getLocale(), handlers)),
    );
  }
}

async function stopLocalServices(): Promise<void> {
  stopDashboardDevServer();
  const relay = wsRelay;
  wsRelay = null;
  if (relay) {
    await relay.stop().catch(() => undefined);
  }
  const sidecar = supervisor;
  supervisor = null;
  backendPort = 0;
  if (sidecar) {
    await sidecar.stop().catch(() => undefined);
  }
}

/**
 * Prepare the local portable runtime, sidecar, ws relay, and optional dev
 * server. Returns the local Dashboard origin on success, or null after calling
 * ``onError`` with a user-facing failure.
 */
async function prepareAndStartLocalMode(
  onError: (failure: ShellFailure) => void,
): Promise<string | null> {
  const octopHome = octopHomeDir;
  const devPortableDir = (process.env.OCTOP_PORTABLE_DIR ?? "").trim();
  let portableDir = devPortableDir;
  if (!portableDir) {
    const installed = installedRuntimeDir(resourcesRoot(), process.platform, existsSync);
    if (installed) {
      portableDir = installed;
      desktopLog().info(`runtime installed at ${installed}`);
    }
  }

  if (!portableDir) {
    portableDir = join(octopHome, "portable");
    try {
      const bundled = await readBundledPortable();
      const local = await readLocalRuntime(octopHome);
      const decision = classifyRuntime(bundled, local, compareVersions);

      desktopLog().info(
        `runtime ${decision.action} (${decision.reason}) bundled=${bundled.version} local=${local.version ?? "none"}`,
      );
      if (decision.action === "stop") {
        onError({
          message: shellT("shell.runtimeTooNew", {
            localVersion: decision.localVersion,
            bundledVersion: bundled.version,
          }),
          detail: errorDetail(shellT("shell.runtimeDir", { dir: portableDir })),
        });
        return null;
      }

      if (decision.action === "extract" || decision.action === "replace") {
        const zip = portableZipPath();
        const digest = await sha256File(zip);
        if (digest !== bundled.sha256) {
          desktopLog().error(`portable zip sha256 mismatch file=${zip}`);
          onError({
            message: shellT("shell.checksumFailed"),
            detail: errorDetail(
              shellT("shell.checksumDetail", { file: zip, expected: bundled.sha256, actual: digest }),
            ),
          });
          return null;
        }
        extractPortableZip(zip, portableDir);
        await writeLocalVersion(octopHome, bundled.version);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      desktopLog().error(`portable runtime preparation failed: ${detail}`);
      onError({
        message: shellT("shell.portableFailed"),
        detail: errorDetail(detail),
      });
      return null;
    }
  }

  const interpreter = join(portableDir, "runtime", process.platform === "win32" ? "python.exe" : "bin/python3");
  backend = {
    interpreter,
    launchScript: join(portableDir, "launch.py"),
    cwd: portableDir,
    octopHome,
    portableDir,
  };

  if (!deviceSession) {
    const cipher = safeStorageCipher();
    await warnIfKeychainUnavailable(cipher);
    const credentialStore = new DeviceCredentialStore(octopHome, cipher);
    try {
      await credentialStore.migrate();
    } catch (err) {
      desktopLog().warn(`[desktop] device credential migration failed: ${String(err)}`);
    }
    deviceSession = new DeviceSessionClient({
      store: credentialStore,
      baseUrl: () => (apiAdmissionClosed || !backendPort ? null : `http://127.0.0.1:${backendPort}`),
      label: `${process.platform}-${process.arch}`,
    });
  }

  registerProtocol(dashboardRoot(portableDir));

  const dashboardDev = app.isPackaged ? null : readDashboardDev(process.env);
  const windowOrigin = dashboardDev ? dashboardDevOrigin(dashboardDev.port) : WINDOW_ORIGIN;
  if (!wsRelay) {
    wsRelay = new WsRelay({
      backendPort: () => (apiAdmissionClosed || !backendPort ? 0 : backendPort),
      allowedOrigin: windowOrigin,
    });
    try {
      await wsRelay.start();
    } catch (err) {
      desktopLog().warn(`[desktop] websocket relay unavailable: ${errorMessageOf(err)}`);
      wsRelay = null;
    }
  }

  if (!supervisor?.isRunning()) {
    const ready = await startBackend();
    if (!ready) {
      onError({
        message: shellT("shell.pythonFailed"),
        detail: errorDetail(
          backend ? shellT("shell.launcherPort", { script: backend.launchScript, port: backendPort }) : undefined,
        ),
      });
      return null;
    }
  }

  if (dashboardDev) {
    try {
      desktopLog().info(`[dev] dashboard hot reload at ${windowOrigin}`);
      await startDashboardDevServer({
        sourceDir: dashboardDev.sourceDir,
        port: dashboardDev.port,
        apiPort: backendPort,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      desktopLog().error(`dashboard dev server failed: ${detail}`);
      onError({
        message: shellT("shell.devServerFailed"),
        detail: errorDetail(detail),
      });
      return null;
    }
  }

  return dashboardDev ? windowOrigin : PACKAGED_APP_ORIGIN;
}

async function confirmInsecureHttpConnection(
  win: BrowserWindow | null,
  url: string,
): Promise<boolean> {
  const options = {
    type: "warning" as const,
    buttons: [shellT("shell.insecureHttpContinue"), shellT("shell.cancel")],
    defaultId: 1,
    cancelId: 1,
    message: shellT("shell.insecureHttpTitle"),
    detail: shellT("shell.insecureHttpDetail", { url }),
    noLink: true,
  };
  const { response } = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options);
  return response === 0;
}

async function switchToRemote(
  rawUrl: string,
  label?: string,
  targetWin?: BrowserWindow,
): Promise<ConnectionState> {
  const normalizedUrl = normalizeRemoteServerUrl(rawUrl);
  if (switchingConnection) return currentConnectionState();
  switchingConnection = true;
  try {
    const win =
      (targetWin && !targetWin.isDestroyed() ? targetWin : null) ??
      BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ??
      null;

    if (isInsecureRemoteUrl(normalizedUrl)) {
      const confirmed = await confirmInsecureHttpConnection(win, normalizedUrl);
      if (!confirmed) {
        return currentConnectionState();
      }
    }

    const current = settingsStore.load();
    const savedRemoteServers = upsertSavedServer(current.savedRemoteServers, {
      url: normalizedUrl,
      label,
    });
    settingsStore.save({
      connectionMode: "remote",
      remoteServerUrl: normalizedUrl,
      savedRemoteServers,
    });
    activeConnectionMode = "remote";
    activeRemoteUrl = normalizedUrl;
    const remoteOrigin = serverOriginOf(normalizedUrl);
    dashboardOrigin = remoteOrigin;

    await stopLocalServices();

    const nextState = currentConnectionState();
    broadcastConnectionState(nextState);

    if (win) {
      installDashboardGuards(win, {
        appOrigin: () => dashboardOrigin ?? PACKAGED_APP_ORIGIN,
        onNavigate: openExternal,
        onLoadFail: (failedUrl, reason) => handleWindowLoadFail(win, failedUrl, reason),
      });
      void win.loadURL(entryUrlForTarget(remoteOrigin));
    } else {
      openDashboardWindow(remoteOrigin);
    }
    return nextState;
  } finally {
    switchingConnection = false;
  }
}

async function switchToLocal(targetWin?: BrowserWindow): Promise<ConnectionState> {
  if (switchingConnection) return currentConnectionState();
  switchingConnection = true;
  try {
    settingsStore.save({ connectionMode: "local" });
    activeConnectionMode = "local";
    activeRemoteUrl = null;
    const nextState = currentConnectionState();
    broadcastConnectionState(nextState);

    const win =
      (targetWin && !targetWin.isDestroyed() ? targetWin : null) ??
      BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ??
      null;
    const chromeTheme = resolveWindowChromeTheme(settingsStore.load().themeBackground);
    if (win) {
      void win.loadFile(SPLASH_PATH, {
        query: { version: appVersion, theme: chromeTheme.mode },
      });
    }

    const localOrigin = await prepareAndStartLocalMode((failure) => {
      if (win && !win.isDestroyed()) {
        showWindowError(win, failure);
      }
    });
    if (!localOrigin) return nextState;

    dashboardOrigin = localOrigin;
    if (win && !win.isDestroyed()) {
      installDashboardGuards(win, {
        appOrigin: () => dashboardOrigin ?? PACKAGED_APP_ORIGIN,
        onNavigate: openExternal,
        onLoadFail: (failedUrl, reason) => handleWindowLoadFail(win, failedUrl, reason),
      });
      void win.loadURL(entryUrlForTarget(localOrigin));
    } else {
      openDashboardWindow(localOrigin);
    }
    return nextState;
  } finally {
    switchingConnection = false;
  }
}

function readGitStamp(args: readonly string[]): string | null {
  const root = repoRootWithGit(app.getAppPath());
  if (!root) return null;
  try {
    const out = execFileSync("git", [...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 2000,
      windowsHide: true,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function repoRootWithGit(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/** Notification-area icon. Left click and "show" open the window; "quit" exits. */
async function installSystemTray(): Promise<void> {
  if (tray || !shouldInstallSystemTray(process.platform)) return;
  const candidates = trayIconCandidates({
    platform: process.platform,
    isPackaged: app.isPackaged,
    resourcesDir: resourcesRoot(),
    execPath: process.execPath,
  });
  const icon = await loadTrayIcon(candidates);
  if (!icon) {
    desktopLog().warn(`tray icon missing: ${candidates.join(", ")}`);
    return;
  }
  // Pass the Windows ico through unchanged. Resizing it to one 32px bitmap is
  // what Windows removes from the notification area when the window is hidden.
  // The Linux panel wants a small PNG; a full app icon is dropped or drawn huge.
  trayIcon = process.platform === "linux" ? icon.resize({ width: 24, height: 24 }) : icon;
  const created = new Tray(trayIcon);
  created.setToolTip("Octop");
  const labels = trayMenuLabels(app.getLocale());
  const menu = Menu.buildFromTemplate([
    { label: labels.show, click: () => revealAppWindow() },
    { type: "separator" },
    { label: labels.quit, click: () => app.quit() },
  ]);
  // Left click opens the window. The menu stays on right click so a left
  // click is not swallowed by the context menu on Windows. Linux panels open
  // the menu from the icon, so the same menu has to be the context menu.
  created.on("click", () => revealAppWindow());
  created.on("double-click", () => revealAppWindow());
  if (process.platform === "linux") created.setContextMenu(menu);
  else created.on("right-click", () => created.popUpContextMenu(menu));
  tray = created;
  desktopLog().info("tray icon ready");
}

/**
 * The bundled ico first. `createFromPath` cannot read an icon out of an exe,
 * so a packaged build with no loose ico uses the Shell icon instead.
 */
async function loadTrayIcon(candidates: readonly string[]): Promise<NativeImage | null> {
  const imagePath = trayIconImagePath(candidates, existsSync);
  if (imagePath) {
    const loaded = nativeImage.createFromPath(imagePath);
    if (!loaded.isEmpty()) return loaded;
    desktopLog().warn(`tray icon unreadable: ${imagePath}`);
  }
  const executable = trayExecutableFallback(candidates);
  if (!executable) return null;
  try {
    const icon = await app.getFileIcon(executable, { size: "small" });
    return icon.isEmpty() ? null : icon;
  } catch (err) {
    desktopLog().warn(
      `tray icon from executable failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function destroySystemTray(): void {
  tray?.destroy();
  tray = null;
  trayIcon = null;
}

/** Project the stored login preference onto the OS. macOS and Windows use Electron; Linux uses XDG autostart. */
function syncLoginItem(settings: ClientSettings): void {
  const plan = planLoginItem({
    platform: process.platform,
    launchAtLogin: settings.launchAtLogin,
    launchWithoutWindow: settings.launchWithoutWindow,
    execPath: process.execPath,
    appPath: app.getAppPath(),
    packaged: app.isPackaged,
    autostartDir: linuxAutostartDir(app.getPath("home"), process.env.XDG_CONFIG_HOME),
  });
  commitLoginItem(plan, {
    setElectronLoginItem: (item) => app.setLoginItemSettings(item),
    mkdir: (path) => mkdirSync(path, { recursive: true }),
    writeFile: (path, contents) => writeFileSync(path, contents, "utf8"),
    removeFile: (path) => {
      try {
        rmSync(path);
      } catch (err) {
        const code = err instanceof Error && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
        if (code !== "ENOENT") throw err;
      }
    },
  });
}

async function boot(): Promise<void> {
  changeShellLanguage(app.getLocale());
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  if (process.platform === "win32") {
    app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
  }

  appVersion = await resolveProductVersion();

  settingsStore = new ClientSettingsStore(defaultClientSettingsPath(app.getPath("userData")));
  const settings = settingsStore.load();
  closeBehavior = settings.closeBehavior;
  activeConnectionMode = settings.connectionMode;
  activeRemoteUrl = settings.connectionMode === "remote" ? settings.remoteServerUrl : null;
  installAppMenu(appVersion);
  const openedHidden = shouldStartHidden({
    platform: process.platform,
    argv: process.argv,
    wasOpenedAtLogin:
      process.platform === "darwin" ? app.getLoginItemSettings().wasOpenedAtLogin === true : false,
    launchWithoutWindow: settings.launchWithoutWindow,
  });
  // Apply the source before resolving, so a stored "system" reads the OS
  // preference rather than whatever an earlier explicit source left behind.
  applyNativeTheme({
    mode: settings.themeBackground === "dark" ? "dark" : "light",
    scheme: settings.themeBackground,
  });
  const chromeTheme = resolveWindowChromeTheme(settings.themeBackground);

  const early = createEarlyWindow({
    splashFile: SPLASH_PATH,
    errorFile: ERROR_PATH,
    version: appVersion,
    // Same preload as the Dashboard: this window loads that page next, and a
    // BrowserWindow cannot swap its preload.
    preload: PRELOAD_PATH,
    theme: chromeTheme,
    showWhenReady: !openedHidden,
  });
  watchLinuxCaptionState(early.browserWindow);

  // Resolve OCTOP_HOME, reading the login shell on macOS/Linux (GUI apps don't
  // inherit it). The extraction dir and the child env must agree on one root.
  const loginShellEnv =
    process.platform === "win32" ? {} : await readLoginShellEnv(process.env.SHELL);
  const octopHome = resolveOctopHome(process.env, loginShellEnv);
  octopHomeDir = octopHome;
  installDesktopLog(octopHome);
  desktopLog().info(`desktop ${appVersion} home=${octopHome} mode=${activeConnectionMode}`);
  try {
    syncLoginItem(settings);
  } catch (err) {
    desktopLog().warn(
      `login item update failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  await installSystemTray();
  // A hidden login launch with no tray icon would leave the window unreachable.
  if (openedHidden && shouldInstallSystemTray(process.platform) && tray === null) {
    if (!early.browserWindow.isDestroyed()) early.browserWindow.show();
  }

  registerIpcHandlers();

  // Thin-client remote mode: skip local Python sidecar & wsRelay completely
  // and connect directly to the remote Octop Server.
  if (activeConnectionMode === "remote" && activeRemoteUrl) {
    const remoteOrigin = serverOriginOf(activeRemoteUrl);
    desktopLog().info(`thin-client mode: connecting to ${activeRemoteUrl}`);
    continueInEarlyWindow(early, remoteOrigin);
    return;
  }

  const appOrigin = await prepareAndStartLocalMode((failure) => early.showError(failure));
  if (!appOrigin) return;

  // Stay in the splash window. Closing it and opening another one is the
  // flash the user sees when "正在准备本地服务" finishes.
  continueInEarlyWindow(early, appOrigin);
}

app.whenReady().then(boot).catch((err) => {
  desktopLog().error(`octop-desktop boot failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  app.quit();
});

app.on("second-instance", () => {
  revealAppWindow();
});

// macOS emits this for a Dock click. With no listener the process stays in the
// Dock after the window is closed or hidden, and the click does nothing.
app.on("activate", () => {
  revealAppWindow();
});

setBeforeRelaunchHook(async () => {
  quitting = true;
  destroySystemTray();
  stopDashboardDevServer();
  await wsRelay?.stop().catch(() => undefined);
  await supervisor?.stop().catch(() => undefined);
});

app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  destroySystemTray();
  stopDashboardDevServer();
  const sidecar = supervisor;
  const relay = wsRelay;
  if (!sidecar && !relay) return;
  // §3.4: the sidecar runs in its own process group, so quitting without
  // waiting would orphan Python. Give it the grace window, then really quit.
  event.preventDefault();
  // Close the relay first: nothing may attach to a sidecar that is shutting
  // down, and its listening socket would keep the process alive otherwise.
  void (async () => {
    await relay?.stop();
    await sidecar?.stop();
  })()
    .catch((err) =>
      desktopLog().error(
        `octop-desktop quit failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      ),
    )
    .finally(() => app.quit());
});

app.on("window-all-closed", () => {
  // darwin + tray keeps the process so the Dock icon can open the window again.
  // Windows and Linux hide the dashboard window instead of closing it, so this
  // does not fire for that button. A real close (the splash, or closeBehavior
  // quit) still exits.
  if (process.platform !== "darwin" || closeBehavior === "quit") app.quit();
});

/**
 * Terminal Ctrl+C, `kill`, an IDE stop button and a service manager all send a
 * signal rather than a quit event, and the default action kills the shell
 * outright — `before-quit` never runs, so the sidecar survives as an orphan.
 * Python is spawned detached (§3.1) precisely so it is not in the terminal's
 * process group, which means the shell is the only one who can reap it.
 */
let signalReceived = 0;

async function shutdownFromSignal(signal: NodeJS.Signals): Promise<void> {
  signalReceived += 1;
  if (signalReceived > 1) {
    // Second Ctrl+C: the user wants out now, do not wait for the grace window.
    app.exit(0);
    return;
  }
  desktopLog().warn(`[desktop] ${signal} received — stopping the Python sidecar…`);
  // Keep `before-quit` from preventDefault-ing into a second stop attempt; the
  // exit below is deliberate and must not be deferred again.
  quitting = true;
  destroySystemTray();
  try {
    stopDashboardDevServer();
    await wsRelay?.stop();
    await supervisor?.stop();
  } catch (err) {
    desktopLog().error(
      `octop-desktop shutdown failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
    );
  } finally {
    // `app.exit` skips `before-quit`/`will-quit`, so nothing can keep the
    // process alive after Python is gone.
    app.exit(0);
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  // Ctrl+C in a dev terminal is a normal way to stop the app, so exit 0 instead
  // of 130: pnpm prints "ELIFECYCLE Command failed" for non-zero exits.
  process.on(signal, () => void shutdownFromSignal(signal));
}
