import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ClientSettings } from "../../shared/ipc-contract";
import { sanitizeSavedServers, tryNormalizeRemoteServerUrl } from "../connection/server-target";

/**
 * Shell-owned client settings, persisted separately from ``config.json``. The
 * renderer may read/write these through the bridge but can never point the
 * update check at another host or authorize an install (§5.3 / §6.2).
 */

const DEFAULTS: ClientSettings = {
  launchAtLogin: false,
  launchWithoutWindow: false,
  closeBehavior: "tray",
  themeBackground: "system",
  stableOnly: true,
  connectionMode: "local",
  remoteServerUrl: null,
  savedRemoteServers: [],
};

const BOOLEAN_KEYS = new Set(["stableOnly", "launchAtLogin", "launchWithoutWindow"]);

const SETTING_KEYS = new Set(Object.keys(DEFAULTS));

export class ClientSettingsStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  load(): ClientSettings {
    if (!existsSync(this.filePath)) return { ...DEFAULTS, savedRemoteServers: [] };
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as Record<string, unknown>;
      const out: ClientSettings = { ...DEFAULTS, savedRemoteServers: [] };
      for (const key of SETTING_KEYS) {
        const value = raw[key];
        if (value === undefined) continue;
        // Basic shape validation: only accept known scalar values.
        if (BOOLEAN_KEYS.has(key)) {
          if (typeof value === "boolean") (out as unknown as Record<string, unknown>)[key] = value;
        } else if (key === "closeBehavior") {
          if (value === "quit" || value === "tray") out.closeBehavior = value;
        } else if (key === "themeBackground") {
          if (value === "system" || value === "light" || value === "dark") {
            out.themeBackground = value;
          }
        } else if (key === "connectionMode") {
          if (value === "local" || value === "remote") {
            out.connectionMode = value;
          }
        } else if (key === "remoteServerUrl") {
          out.remoteServerUrl = tryNormalizeRemoteServerUrl(value);
        } else if (key === "savedRemoteServers") {
          out.savedRemoteServers = sanitizeSavedServers(value);
        }
      }
      if (out.connectionMode === "remote" && !out.remoteServerUrl) {
        out.connectionMode = "local";
      }
      return out;
    } catch {
      return { ...DEFAULTS, savedRemoteServers: [] };
    }
  }

  save(patch: Partial<ClientSettings>): ClientSettings {
    const current = this.load();
    const record = patch && typeof patch === "object" ? (patch as Record<string, unknown>) : {};
    const sanitized: ClientSettings = {
      ...current,
      savedRemoteServers: [...current.savedRemoteServers],
    };
    for (const key of SETTING_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
      const value = record[key];
      if (value === undefined) continue;
      if (BOOLEAN_KEYS.has(key)) {
        (sanitized as unknown as Record<string, unknown>)[key] =
          typeof value === "boolean" ? value : (DEFAULTS as unknown as Record<string, unknown>)[key];
      } else if (key === "closeBehavior") {
        sanitized.closeBehavior = value === "quit" || value === "tray" ? value : DEFAULTS.closeBehavior;
      } else if (key === "themeBackground") {
        sanitized.themeBackground =
          value === "system" || value === "light" || value === "dark"
            ? value
            : DEFAULTS.themeBackground;
      } else if (key === "connectionMode") {
        sanitized.connectionMode =
          value === "local" || value === "remote" ? value : DEFAULTS.connectionMode;
      } else if (key === "remoteServerUrl") {
        sanitized.remoteServerUrl = value === null ? null : tryNormalizeRemoteServerUrl(value);
      } else if (key === "savedRemoteServers") {
        sanitized.savedRemoteServers = sanitizeSavedServers(value);
      }
    }
    if (sanitized.connectionMode === "remote" && !sanitized.remoteServerUrl) {
      sanitized.connectionMode = "local";
    }
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(sanitized, null, 2), "utf8");
    return sanitized;
  }
}

export function defaultClientSettingsPath(userDataDir: string): string {
  return join(userDataDir, "desktop-settings.json");
}
