/**
 * Reverse-proxy ``octop://app/api/*`` to the current backend (§5.2).
 *
 * Local mode targets the sidecar on ``127.0.0.1``. Remote mode targets the
 * saved origin. The renderer never names that target. Hop-by-hop headers are
 * stripped and the stream is forwarded with backpressure, so SSE is not
 * buffered. Redirects are not followed: ``isRedirectStatus`` decides that in
 * the protocol handler.
 */

import type { BackendTarget } from "../connection/target";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/** Headers we always drop on the way to the backend (spoofable connection state). */
const STRIP_REQUEST = new Set(["host", "origin", "cookie", "content-length"]);

export function sanitizeForwardHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (STRIP_REQUEST.has(lower)) return;
    out[key] = value;
  });
  return out;
}

/** Map ``octop://app/api/...`` onto the current backend, preserving the query. */
export function toBackendUrl(target: BackendTarget, pathname: string, search: string): string {
  const rest = pathname.replace(/^\/api/, "");
  return `${target.origin}/api${rest}${search}`;
}

/** Upstream ``Host`` value. Fetch may ignore a manual Host; the relay sets it itself. */
export function backendHostHeader(target: BackendTarget): string {
  return target.hostHeader;
}

/** Only the app's own ``/api/*`` route is proxied — everything else is static. */
export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}
