/**
 * Minimal, dependency-free JWT payload reader.
 *
 * Signature verification is never the renderer's job — the backend does that.
 * These helpers only answer "which account / which session does this token
 * belong to", which the UI needs before it can even send a request.
 */

function readClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json =
      typeof TextDecoder !== "undefined"
        ? new TextDecoder().decode(bytes)
        : binary;
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function jwtStringClaim(token: string, key: string): string | null {
  const claims = readClaims(token);
  const value = claims?.[key];
  return typeof value === "string" ? value : null;
}

/** True when this local JWT belongs to a cloud-managed account. */
export function isCloudSessionToken(token: string): boolean {
  const value = jwtStringClaim(token, "cs");
  return Boolean(value && value.length > 0);
}
