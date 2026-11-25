import type { RemoteServerEntry } from "../../shared/ipc-contract";

const DASHBOARD_THEME_QUERY = "octopTheme";
const MAX_SAVED_SERVERS = 20;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function defaultSchemeForAuthority(authority: string): "http://" | "https://" {
  const lower = authority.toLowerCase();
  const portMatch = lower.match(/:(\d+)$/);
  const port = portMatch ? portMatch[1] : null;
  const hostOnly = portMatch ? lower.slice(0, -portMatch[0].length) : lower;
  if (LOOPBACK_HOSTS.has(hostOnly)) return "http://";
  if ((IPV4_RE.test(hostOnly) || hostOnly.startsWith("[")) && port !== "443") {
    return "http://";
  }
  return "https://";
}

/**
 * Validate and canonicalize a remote Octop server URL for thin-client mode.
 *
 * Accepts ``https://...`` or ``http://...`` (or a bare host, which defaults to
 * ``http://`` for loopback / raw IP literals unless port 443, and ``https://``
 * for domain names). Rejects non-HTTP schemes and embedded credentials so the
 * shell never navigates to arbitrary schemes or leaks secrets in URLs.
 */
export function normalizeRemoteServerUrl(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    throw new Error("Server URL is required");
  }

  let candidate = trimmed;
  const hasExplicitScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate);
  const looksLikeHostPort = /^(\[[^\]]+\]|[^/:?#]+):\d+(\/|$)/.test(candidate);
  if (!hasExplicitScheme || looksLikeHostPort) {
    const authority = candidate.split(/[/?#]/, 1)[0] ?? "";
    candidate = `${defaultSchemeForAuthority(authority)}${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Invalid server URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Server URL must use http or https");
  }
  if (!parsed.hostname) {
    throw new Error("Server URL is missing a hostname");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Server URL must not contain credentials");
  }

  const pathname = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${pathname}`;
}

/** Safe wrapper returning null instead of throwing. */
export function tryNormalizeRemoteServerUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    return normalizeRemoteServerUrl(raw);
  } catch {
    return null;
  }
}

/** Origin portion used by window navigation guards. */
export function serverOriginOf(url: string): string {
  return new URL(url).origin;
}

/**
 * True when a remote server URL uses cleartext HTTP outside loopback, where
 * credentials, session tokens, and chat traffic can be intercepted or tampered
 * with in transit.
 */
export function isInsecureRemoteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    return !LOOPBACK_HOSTS.has(host) && !LOOPBACK_HOSTS.has(`[${host}]`);
  } catch {
    return false;
  }
}

/** Default human-friendly label when the user does not provide one. */
export function defaultServerLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return url;
  }
}

/** Build the entry URL for loading a remote Octop server with the current theme preference. */
export function remoteServerEntryUrl(
  scheme: "system" | "light" | "dark",
  remoteUrl: string,
): string {
  const parsed = new URL(remoteUrl);
  if (!parsed.pathname.endsWith("/")) {
    parsed.pathname = `${parsed.pathname}/`;
  }
  parsed.searchParams.set(DASHBOARD_THEME_QUERY, scheme);
  return parsed.toString();
}

/** Insert or move a server entry to the top of the saved list, deduplicated by normalized URL. */
export function upsertSavedServer(
  list: readonly RemoteServerEntry[],
  entry: { url: string; label?: string; lastUsedAt?: number },
): RemoteServerEntry[] {
  const normalizedUrl = normalizeRemoteServerUrl(entry.url);
  const existing = list.find((item) => tryNormalizeRemoteServerUrl(item.url) === normalizedUrl);
  const cleanLabel = (entry.label ?? "").trim() || existing?.label || defaultServerLabel(normalizedUrl);
  const next: RemoteServerEntry = {
    url: normalizedUrl,
    label: cleanLabel,
    lastUsedAt: entry.lastUsedAt ?? Date.now(),
  };
  const rest = list.filter((item) => tryNormalizeRemoteServerUrl(item.url) !== normalizedUrl);
  return [next, ...rest].slice(0, MAX_SAVED_SERVERS);
}

/** Remove a saved server by URL. */
export function removeSavedServer(
  list: readonly RemoteServerEntry[],
  url: string,
): RemoteServerEntry[] {
  const target = tryNormalizeRemoteServerUrl(url) ?? url.trim();
  return list.filter((item) => (tryNormalizeRemoteServerUrl(item.url) ?? item.url) !== target);
}

/** Sanitize a persisted list loaded from disk. */
export function sanitizeSavedServers(raw: unknown): RemoteServerEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RemoteServerEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = tryNormalizeRemoteServerUrl(record.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const label =
      typeof record.label === "string" && record.label.trim()
        ? record.label.trim().slice(0, 64)
        : defaultServerLabel(url);
    const lastUsedAt =
      typeof record.lastUsedAt === "number" && Number.isFinite(record.lastUsedAt)
        ? record.lastUsedAt
        : undefined;
    out.push({ url, label, ...(lastUsedAt !== undefined ? { lastUsedAt } : {}) });
    if (out.length >= MAX_SAVED_SERVERS) break;
  }
  return out;
}
