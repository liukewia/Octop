import { describe, expect, it } from "vitest";

import { isCloudSessionToken, jwtStringClaim } from "./jwtClaims";

function token(payload: Record<string, unknown>): string {
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${body}.signature`;
}

describe("jwtClaims", () => {
  it("reads a string claim", () => {
    expect(jwtStringClaim(token({ uname: "local" }), "uname")).toBe("local");
  });

  it("recognises a cloud session token", () => {
    expect(isCloudSessionToken(token({ cs: "session-1" }))).toBe(true);
  });

  it("treats a local token as local", () => {
    expect(isCloudSessionToken(token({ uname: "local" }))).toBe(false);
  });

  it("survives a malformed token", () => {
    expect(isCloudSessionToken("not-a-jwt")).toBe(false);
    expect(jwtStringClaim("a.!!!.c", "cs")).toBeNull();
  });
});
