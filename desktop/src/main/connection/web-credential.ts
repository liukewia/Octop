/**
 * Cloud mode opens the server's own Dashboard. The shell writes the JWT into
 * that page and then stays out of `/api` and WebSocket.
 */

/** Same key as `AUTH_TOKEN_KEY` in `dashboard/src/api/request.ts`. */
export const WEB_AUTH_TOKEN_KEY = "auth_token";

export interface ParsedSetCookie {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "no_restriction";
  path: string;
  maxAge: number | null;
}

/** `Set-Cookie` lines from a fetch response. Node exposes them via `getSetCookie`. */
export function setCookieHeaders(headers: Headers): string[] {
  const listed = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof listed.getSetCookie === "function") {
    const values = listed.getSetCookie().map((item) => item.trim()).filter((item) => item.length > 0);
    if (values.length > 0) return values;
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

/** One `Set-Cookie` header. `Secure` is taken from the header, not guessed. */
export function parseSetCookie(header: string): ParsedSetCookie | null {
  const parts = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const pair = parts[0];
  if (!pair) return null;
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!name || !value) return null;
  let httpOnly = false;
  let secure = false;
  let sameSite: ParsedSetCookie["sameSite"] = "lax";
  let path = "/";
  let maxAge: number | null = null;
  for (const attr of parts.slice(1)) {
    const splitAt = attr.indexOf("=");
    const key = (splitAt === -1 ? attr : attr.slice(0, splitAt)).trim().toLowerCase();
    const attrValue = splitAt === -1 ? "" : attr.slice(splitAt + 1).trim();
    if (key === "httponly") httpOnly = true;
    else if (key === "secure") secure = true;
    else if (key === "path" && attrValue) path = attrValue;
    else if (key === "max-age") {
      const parsed = Number(attrValue);
      if (Number.isFinite(parsed)) maxAge = parsed;
    } else if (key === "samesite") {
      const site = attrValue.toLowerCase();
      if (site === "strict") sameSite = "strict";
      else if (site === "none") sameSite = "no_restriction";
      else sameSite = "lax";
    }
  }
  return { name, value, httpOnly, secure, sameSite, path, maxAge };
}

/**
 * Page the shell loads after a cloud login. The Dashboard is whatever that
 * origin serves; the shell does not substitute its packaged copy.
 */
export function remotePageUrl(origin: string, theme: "system" | "light" | "dark"): string {
  const url = new URL("/", origin);
  url.searchParams.set("octopTheme", theme);
  return url.toString();
}

/**
 * Runs in the page before its own scripts. Writes the JWT only when the
 * document is still the server the user signed in to.
 */
export function webAuthBootstrapSource(origin: string, token: string): string {
  return `if (location.origin === ${JSON.stringify(origin)}) localStorage.setItem(${JSON.stringify(WEB_AUTH_TOKEN_KEY)}, ${JSON.stringify(token)});`;
}

/** Remote pages dial their own host. The loopback relay is only for the shell's page. */
export function pageRelayEndpoint<T>(mode: "local" | "remote", endpoint: T | null): T | null {
  if (mode === "remote") return null;
  return endpoint;
}
