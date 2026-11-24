import { dirname, join } from "node:path";

/**
 * Login-item registration. Electron's API covers macOS and Windows only.
 * Linux writes an XDG autostart entry. macOS cannot pass arguments, so a
 * hidden login launch is recognised from `wasOpenedAtLogin` plus the stored
 * preference. Windows and Linux pass the two flags below.
 */

export const OPENED_AT_LOGIN_ARG = "--octop-opened-at-login";
export const START_HIDDEN_ARG = "--octop-start-hidden";
export const LINUX_AUTOSTART_FILENAME = "com.tencent.octop.desktop";

export interface LoginItemRequest {
  platform: string;
  launchAtLogin: boolean;
  launchWithoutWindow: boolean;
  execPath: string;
  appPath: string;
  packaged: boolean;
  /** Linux autostart directory. Ignored on the other platforms. */
  autostartDir?: string;
}

export interface ElectronLoginItem {
  openAtLogin: boolean;
  path?: string;
  args?: string[];
}

export interface AutostartFile {
  path: string;
  /** Absent when the entry should be removed. */
  contents?: string;
}

export interface LoginItemPlan {
  electron?: ElectronLoginItem;
  autostart?: AutostartFile;
}

export function linuxAutostartDir(home: string, xdgConfigHome: string | undefined): string {
  const config = xdgConfigHome?.trim();
  return join(config ? config : join(home, ".config"), "autostart");
}

/**
 * True only for this process when the OS login item started it and the user
 * asked that launch to stay hidden. Opening the app from the icon still shows
 * the window, even if the preference is on.
 */
export function shouldStartHidden(input: {
  platform: string;
  argv: readonly string[];
  wasOpenedAtLogin: boolean;
  launchWithoutWindow: boolean;
}): boolean {
  if (input.platform === "darwin") {
    return input.wasOpenedAtLogin && input.launchWithoutWindow;
  }
  return input.argv.includes(OPENED_AT_LOGIN_ARG) && input.argv.includes(START_HIDDEN_ARG);
}

export function planLoginItem(input: LoginItemRequest): LoginItemPlan {
  if (input.platform === "linux") {
    if (!input.autostartDir) return {};
    const path = join(input.autostartDir, LINUX_AUTOSTART_FILENAME);
    if (!input.launchAtLogin) return { autostart: { path } };
    return {
      autostart: {
        path,
        contents: linuxAutostartEntry(input.execPath, loginArgs(input)),
      },
    };
  }
  if (input.platform === "darwin") {
    return { electron: { openAtLogin: input.launchAtLogin } };
  }
  if (input.platform !== "win32") return {};
  return {
    electron: {
      openAtLogin: input.launchAtLogin,
      path: input.execPath,
      args: loginArgs(input),
    },
  };
}

export function commitLoginItem(
  plan: LoginItemPlan,
  io: {
    setElectronLoginItem(settings: ElectronLoginItem): void;
    mkdir(path: string): void;
    writeFile(path: string, contents: string): void;
    removeFile(path: string): void;
  },
): void {
  if (plan.electron) io.setElectronLoginItem(plan.electron);
  if (!plan.autostart) return;
  if (plan.autostart.contents === undefined) {
    io.removeFile(plan.autostart.path);
    return;
  }
  io.mkdir(dirname(plan.autostart.path));
  io.writeFile(plan.autostart.path, plan.autostart.contents);
}

function loginArgs(input: LoginItemRequest): string[] {
  const args: string[] = [];
  if (!input.packaged) args.push(input.appPath);
  if (!input.launchAtLogin) return args;
  args.push(OPENED_AT_LOGIN_ARG);
  if (input.launchWithoutWindow) args.push(START_HIDDEN_ARG);
  return args;
}

function linuxAutostartEntry(execPath: string, args: readonly string[]): string {
  const exec = [execPath, ...args].map(quoteDesktopExec).join(" ");
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.0",
    "Name=Octop",
    `Exec=${exec}`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

/** Freedesktop `Exec` quoting. Bare tokens stay bare; special chars are escaped inside quotes. */
function quoteDesktopExec(token: string): string {
  if (/[\r\n]/.test(token)) {
    throw new Error("Autostart Exec token must not contain newlines");
  }
  if (/^[A-Za-z0-9_./:=@-]+$/.test(token)) return token;
  const escaped = token
    .replace(/%/g, "%%")
    .replace(/([\\"`$])/g, "\\$1");
  return `"${escaped}"`;
}
