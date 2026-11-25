/**
 * Shell-owned update installation (§6.3).
 *
 * The page confirms first. This function then installs the release the shell
 * selected itself, so a hostile renderer cannot redirect the download.
 *
 * Order is fixed and must not be reordered:
 *   download → verify → stage → Python clean exit (code 0) → hand off.
 * A dirty sidecar exit cancels the install instead of replacing files under a
 * live Python process. The desktop shell does not use that full sequence for a
 * dmg: it downloads, then opens the disk image and leaves this process running
 * so the user can finish in the system window.
 */

import { shellT } from "../../shared/shell-i18n";
import type { SidecarExit } from "../supervisor/sidecar";
import { isValidAssetUrl, type DownloadAsset, type SelectedRelease } from "./update-coordinator";

export type InstallerKind = "dmg" | "pkg" | "exe" | "msi" | "appimage" | "deb" | "unsupported";

const EXTENSION_KINDS: Readonly<Record<string, InstallerKind>> = {
  dmg: "dmg",
  pkg: "pkg",
  exe: "exe",
  msi: "msi",
  appimage: "appimage",
  deb: "deb",
};

/** Extensions the shell is willing to open. Everything else is refused. */
const SUPPORTED_KINDS: readonly InstallerKind[] = ["dmg", "pkg", "exe", "msi", "appimage", "deb"];

function normalizeExt(ext: string): string {
  return ext.trim().replace(/^\.+/, "").toLowerCase();
}

function nameExt(name: string): string {
  const match = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

/**
 * Resolve the installer type from the manifest asset. ``ext`` wins; the file
 * name is only a fallback for manifests that leave ``ext`` empty.
 */
export function installerKindFor(asset: DownloadAsset): InstallerKind {
  const fromExt = EXTENSION_KINDS[normalizeExt(asset.ext)];
  if (fromExt) return fromExt;
  return EXTENSION_KINDS[nameExt(asset.name)] ?? "unsupported";
}

export function isSupportedKind(kind: InstallerKind): boolean {
  return SUPPORTED_KINDS.includes(kind);
}

/**
 * Local file name for the download. The name arrives from a remote manifest, so
 * every path separator and shell-significant character is stripped: the file can
 * only ever land directly inside the shell's update directory.
 */
export function downloadFilename(asset: DownloadAsset, tag: string): string {
  const ext = normalizeExt(asset.ext) || nameExt(asset.name) || "bin";
  const withoutDir = (asset.name.trim().split(/[\\/]/).pop() ?? "").replace(/\.[A-Za-z0-9]+$/, "");
  const safeStem =
    withoutDir.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "") ||
    `Octop-${tag.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
  return `${safeStem}.${ext}`;
}

export interface InstallPlan {
  kind: InstallerKind;
  url: string;
  filename: string;
}

export function planInstall(selected: SelectedRelease): InstallPlan {
  return {
    kind: installerKindFor(selected.asset),
    url: selected.asset.url,
    filename: downloadFilename(selected.asset, selected.tag),
  };
}

/** Outcome of asking the sidecar to shut down (§3.4). */
export type { SidecarExit };

export interface FetchHooks {
  /** Download the plan's URL, returning the local path of the finished file. */
  download(plan: InstallPlan): Promise<string>;
  /** Integrity check on the downloaded file; ``false`` aborts the install. */
  verify(path: string): Promise<boolean>;
  /**
   * Copy the package into a temp directory before Python exits.
   * A failure here leaves the running backend untouched.
   */
  stage?(kind: InstallerKind, path: string): Promise<void>;
}

export interface CommitHooks {
  /** Ask Python to exit; must resolve within the shell's grace window. */
  stopSidecar(): Promise<SidecarExit>;
  /** Replace the app, or open the OS installer for the given file. */
  handOff(kind: InstallerKind, path: string): Promise<void>;
  /** Install opened but failed: bring the shell's own backend back up. */
  onHandOffFailure?(): Promise<void>;
}

export interface InstallHooks extends FetchHooks, CommitHooks {}

export type InstallFailureReason =
  | "unsupported"
  | "untrusted-url"
  | "download"
  | "verify"
  | "stage"
  | "unclean-exit"
  | "handoff";

export type InstallOutcome =
  | { ok: true; path: string; plan: InstallPlan }
  | { ok: false; reason: InstallFailureReason; message: string };

export type PreparedInstall = { ok: true; path: string; plan: InstallPlan };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Download and stage one release. Python is still running when this resolves,
 * so the page can show "restart to install" before anything is replaced.
 */
export async function fetchUpdatePackage(
  selected: SelectedRelease,
  hooks: FetchHooks,
): Promise<InstallOutcome> {
  const plan = planInstall(selected);
  if (!isSupportedKind(plan.kind)) {
    return {
      ok: false,
      reason: "unsupported",
      message: shellT("update.unsupportedPackage", { ext: selected.asset.ext || selected.asset.name }),
    };
  }
  // Defence in depth: `selectRelease` already filtered on this, but the check
  // lives here too so no future caller can download from an arbitrary host.
  if (!isValidAssetUrl(plan.url)) {
    return { ok: false, reason: "untrusted-url", message: shellT("update.untrustedUrl") };
  }

  let path: string;
  try {
    path = await hooks.download(plan);
  } catch (err) {
    return { ok: false, reason: "download", message: messageOf(err) };
  }

  try {
    if (!(await hooks.verify(path))) {
      return { ok: false, reason: "verify", message: shellT("update.verifyFailed") };
    }
  } catch (err) {
    return { ok: false, reason: "verify", message: messageOf(err) };
  }

  try {
    await hooks.stage?.(plan.kind, path);
  } catch (err) {
    return { ok: false, reason: "stage", message: messageOf(err) };
  }

  return { ok: true, path, plan };
}

/** Stop Python, then hand the prepared package to the in-place swap or the OS installer. */
export async function commitUpdate(
  prepared: PreparedInstall,
  hooks: CommitHooks,
): Promise<InstallOutcome> {
  const exit = await hooks.stopSidecar();
  if (!exit.clean) {
    return {
      ok: false,
      reason: "unclean-exit",
      message: shellT("update.uncleanExit", {
        code: exit.exitCode ?? shellT("update.exitCodeNone"),
      }),
    };
  }

  try {
    await hooks.handOff(prepared.plan.kind, prepared.path);
  } catch (err) {
    // Files were never touched, so the shell can keep running: restart Python.
    await hooks.onHandOffFailure?.();
    return { ok: false, reason: "handoff", message: messageOf(err) };
  }

  return prepared;
}

export async function installUpdate(
  selected: SelectedRelease,
  hooks: InstallHooks,
): Promise<InstallOutcome> {
  const fetched = await fetchUpdatePackage(selected, hooks);
  if (!fetched.ok) return fetched;
  return commitUpdate(fetched, hooks);
}
