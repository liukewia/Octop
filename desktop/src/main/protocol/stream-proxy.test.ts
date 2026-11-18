import assert from "node:assert/strict";
import { test } from "node:test";

import { isRedirectStatus, loopbackTarget } from "../connection/target";
import { remoteBackend, normalizeOrigin } from "../connection/profile";
import { backendHostHeader, toBackendUrl } from "./stream-proxy";

test("a remote target keeps the saved host and does not follow redirects", () => {
  const target = remoteBackend(normalizeOrigin("https://octop.example.com:8443"));
  assert.equal(backendHostHeader(target), "octop.example.com:8443");
  assert.equal(
    toBackendUrl(target, "/api/auth/login", "?x=1"),
    "https://octop.example.com:8443/api/auth/login?x=1",
  );
  assert.equal(isRedirectStatus(302), true);
  assert.equal(isRedirectStatus(200), false);
});

test("a loopback target stays on 127.0.0.1", () => {
  const target = loopbackTarget(43123);
  assert.ok(target);
  assert.equal(backendHostHeader(target), "127.0.0.1:43123");
  assert.equal(toBackendUrl(target, "/api/health", ""), "http://127.0.0.1:43123/api/health");
});
