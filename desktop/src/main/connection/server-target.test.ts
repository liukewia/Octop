import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isInsecureRemoteUrl,
  normalizeRemoteServerUrl,
  remoteServerEntryUrl,
  removeSavedServer,
  sanitizeSavedServers,
  serverOriginOf,
  upsertSavedServer,
} from "./server-target";

test("normalizeRemoteServerUrl canonicalizes hosts and defaults schemes safely", () => {
  assert.equal(normalizeRemoteServerUrl("https://octop.example.com/"), "https://octop.example.com");
  assert.equal(
    normalizeRemoteServerUrl("https://octop.example.com/sub/?a=1#hash"),
    "https://octop.example.com/sub",
  );
  assert.equal(normalizeRemoteServerUrl("octop.example.com"), "https://octop.example.com");
  assert.equal(normalizeRemoteServerUrl("127.0.0.1:8088"), "http://127.0.0.1:8088");
  assert.equal(normalizeRemoteServerUrl("localhost:8000/"), "http://localhost:8000");
  assert.equal(normalizeRemoteServerUrl("119.45.44.173:17564"), "http://119.45.44.173:17564");
  assert.equal(normalizeRemoteServerUrl("119.45.44.173:443"), "https://119.45.44.173");
});

test("isInsecureRemoteUrl flags non-loopback http URLs only", () => {
  assert.equal(isInsecureRemoteUrl("http://119.45.44.173:17564"), true);
  assert.equal(isInsecureRemoteUrl("http://octop.example.com"), true);
  assert.equal(isInsecureRemoteUrl("https://octop.example.com"), false);
  assert.equal(isInsecureRemoteUrl("http://127.0.0.1:8088"), false);
  assert.equal(isInsecureRemoteUrl("http://localhost:8088"), false);
  assert.equal(isInsecureRemoteUrl("http://[::1]:8088"), false);
});

test("normalizeRemoteServerUrl rejects non-http schemes and embedded credentials", () => {
  assert.throws(() => normalizeRemoteServerUrl(""), /required/);
  assert.throws(() => normalizeRemoteServerUrl("file:///etc/passwd"), /http or https/);
  assert.throws(() => normalizeRemoteServerUrl("javascript:alert(1)"), /http or https/);
  assert.throws(() => normalizeRemoteServerUrl("https://user:pass@octop.example.com"), /credentials/);
});

test("remoteServerEntryUrl preserves base path and appends octopTheme", () => {
  assert.equal(
    remoteServerEntryUrl("dark", "https://octop.example.com"),
    "https://octop.example.com/?octopTheme=dark",
  );
  assert.equal(
    remoteServerEntryUrl("system", "https://octop.example.com/app"),
    "https://octop.example.com/app/?octopTheme=system",
  );
  assert.equal(serverOriginOf("https://octop.example.com/app"), "https://octop.example.com");
});

test("upsertSavedServer deduplicates, updates order, and removeSavedServer deletes", () => {
  const first = upsertSavedServer([], { url: "https://a.example.com/", label: "Prod", lastUsedAt: 1 });
  const second = upsertSavedServer(first, { url: "https://b.example.com", lastUsedAt: 2 });
  assert.deepEqual(
    second.map((s) => s.url),
    ["https://b.example.com", "https://a.example.com"],
  );
  assert.equal(second[0]?.label, "b.example.com");

  const promoted = upsertSavedServer(second, { url: "https://a.example.com", lastUsedAt: 3 });
  assert.equal(promoted[0]?.url, "https://a.example.com");
  assert.equal(promoted[0]?.label, "Prod");

  const removed = removeSavedServer(promoted, "https://a.example.com/");
  assert.deepEqual(
    removed.map((s) => s.url),
    ["https://b.example.com"],
  );
});

test("sanitizeSavedServers drops invalid entries and duplicates", () => {
  const sanitized = sanitizeSavedServers([
    { url: "https://ok.example.com/", label: "OK" },
    { url: "https://ok.example.com", label: "Dup" },
    { url: "file:///bad" },
    { url: "https://user:pw@bad.example.com" },
    null,
  ]);
  assert.deepEqual(sanitized, [{ url: "https://ok.example.com", label: "OK" }]);
});
