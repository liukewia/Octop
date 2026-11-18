import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

import type { BackendTarget } from "./target";
import { shellT } from "../../shared/shell-i18n";

/**
 * The saved desktop connection (§REMOTE_BACKEND).
 *
 * ``desktop-connection.json`` holds the mode, origin, and username. The password
 * is a different file. A missing file is local mode. A remote entry must carry
 * an origin and a username; a half-written file is not treated as local.
 */

export const CONNECTION_FILE = "desktop-connection.json";
const FILE_MODE = 0o600;
const ORIGIN_MAX = 2048;
const USERNAME_MAX = 256;
const PASSWORD_MAX = 1024;

export interface RemoteOrigin {
  origin: string;
  hostname: string;
  port: number;
  tls: boolean;
  hostHeader: string;
}

export class OriginRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OriginRejected";
  }
}

export interface StoredConnection {
  mode: "local" | "remote";
  origin: string;
  username: string;
}

export type ConnectionInput =
  | { mode: "local" }
  | {
      mode: "remote";
      origin: RemoteOrigin;
      username: string;
      password: string;
      rememberPassword: boolean;
    };

const LOCAL: StoredConnection = { mode: "local", origin: "", username: "" };

/**
 * Accept ``host``, ``host:port``, ``http://host[:port]``, or ``https://host[:port]``.
 * A host written without a scheme stays ``https``.
 */
export function normalizeOrigin(input: string): RemoteOrigin {
  const raw = input.trim();
  if (!raw || raw.length > ORIGIN_MAX) {
    throw new OriginRejected(shellT("connection.badHost"));
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new OriginRejected(shellT("connection.badHost"));
  }
  if (url.username || url.password) throw new OriginRejected(shellT("connection.noUserinfo"));
  if (url.search || url.hash) throw new OriginRejected(shellT("connection.noQuery"));
  if (url.pathname !== "/" && url.pathname !== "") throw new OriginRejected(shellT("connection.noPath"));

  const https = url.protocol === "https:";
  const http = url.protocol === "http:";
  if (!https && !http) {
    throw new OriginRejected(shellT("connection.httpsOnly"));
  }
  if (!url.hostname) throw new OriginRejected(shellT("connection.badHost"));

  const port = url.port ? Number(url.port) : https ? 443 : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new OriginRejected(shellT("connection.badPort"));
  }
  return {
    origin: url.origin,
    hostname: url.hostname,
    port,
    tls: https,
    hostHeader: url.host,
  };
}

export function remoteBackend(origin: RemoteOrigin): BackendTarget {
  return {
    origin: origin.origin,
    host: origin.hostname,
    port: origin.port,
    tls: origin.tls,
    hostHeader: origin.hostHeader,
  };
}

/** Major version, ignoring a leading ``v``. Missing pieces compare as empty. */
export function versionMajor(version: string): string {
  const stripped = version.trim().replace(/^v/i, "");
  const major = stripped.split(".")[0] ?? "";
  return major;
}

/**
 * Text for the connection status. Same major version produces no warning.
 * A server that omits ``version`` still connects.
 */
export function versionWarning(shellVersion: string, remoteVersion: string | null): string | null {
  if (!remoteVersion) return shellT("connection.versionMissing", { shellVersion });
  if (versionMajor(shellVersion) !== versionMajor(remoteVersion)) {
    return shellT("connection.versionSkew", { shellVersion, remoteVersion });
  }
  return null;
}

export function parseConnectionInput(input: unknown): ConnectionInput | { error: string } {
  if (input === null || typeof input !== "object") return { error: shellT("connection.invalid") };
  const body = input as Record<string, unknown>;
  if (body.mode === "local") return { mode: "local" };
  if (body.mode !== "remote") return { error: shellT("connection.invalid") };

  const originRaw = body.origin;
  const usernameRaw = body.username;
  const passwordRaw = body.password;
  if (typeof originRaw !== "string" || originRaw.length > ORIGIN_MAX) return { error: shellT("connection.needHost") };
  if (typeof usernameRaw !== "string" || usernameRaw.trim().length === 0 || usernameRaw.length > USERNAME_MAX) {
    return { error: shellT("connection.needUsername") };
  }
  if (typeof passwordRaw !== "string" || passwordRaw.length === 0 || passwordRaw.length > PASSWORD_MAX) {
    return { error: shellT("connection.needPassword") };
  }
  if (typeof body.rememberPassword !== "boolean") return { error: shellT("connection.invalid") };
  if (!originRaw.trim() || !usernameRaw.trim()) return { error: shellT("connection.needAll") };

  try {
    return {
      mode: "remote",
      origin: normalizeOrigin(originRaw),
      username: usernameRaw.trim(),
      password: passwordRaw,
      rememberPassword: body.rememberPassword,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : shellT("connection.badHost") };
  }
}

export class ConnectionProfileStore {
  private readonly filePath: string;

  constructor(home: string) {
    this.filePath = join(home, CONNECTION_FILE);
  }

  get path(): string {
    return this.filePath;
  }

  async load(): Promise<StoredConnection> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch {
      return { ...LOCAL };
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredConnection>;
      if (parsed.mode !== "remote") return { ...LOCAL };
      const origin = typeof parsed.origin === "string" ? parsed.origin : "";
      const username = typeof parsed.username === "string" ? parsed.username : "";
      return { mode: "remote", origin, username };
    } catch {
      return { mode: "remote", origin: "", username: "" };
    }
  }

  async save(connection: StoredConnection): Promise<void> {
    const payload =
      connection.mode === "remote"
        ? { mode: "remote" as const, origin: connection.origin, username: connection.username }
        : { mode: "local" as const };
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: FILE_MODE });
    await fs.chmod(this.filePath, FILE_MODE);
  }

  async clear(): Promise<void> {
    await fs.rm(this.filePath, { force: true });
  }
}
