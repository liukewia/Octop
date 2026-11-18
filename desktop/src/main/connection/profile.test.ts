import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ConnectionProfileStore,
  normalizeOrigin,
  OriginRejected,
  parseConnectionInput,
  versionWarning,
} from "./profile";

test("host, host:port, and https origin normalize to one origin", () => {
  const fromHost = normalizeOrigin("octop.example.com:8443");
  const fromUrl = normalizeOrigin("https://octop.example.com:8443");
  const fromSlash = normalizeOrigin("https://octop.example.com:8443/");
  assert.equal(fromHost.origin, "https://octop.example.com:8443");
  assert.equal(fromUrl.origin, fromHost.origin);
  assert.equal(fromSlash.origin, fromHost.origin);
  assert.equal(fromHost.hostHeader, "octop.example.com:8443");
  assert.equal(fromHost.tls, true);
  assert.equal(fromHost.port, 8443);
});

test("a bare host is https on the default port", () => {
  const origin = normalizeOrigin("octop.example.com");
  assert.equal(origin.origin, "https://octop.example.com");
  assert.equal(origin.port, 443);
  assert.equal(origin.hostHeader, "octop.example.com");
});

test("userinfo, paths, queries, and other schemes are rejected", () => {
  const rejected = [
    "https://ada:secret@octop.example.com",
    "https://octop.example.com/api",
    "https://octop.example.com?x=1",
    "https://octop.example.com/#code",
    "ws://octop.example.com",
    "not a url",
    "",
  ];
  for (const input of rejected) {
    assert.throws(() => normalizeOrigin(input), OriginRejected);
  }
});

test("an http address keeps that scheme and port", () => {
  const plain = normalizeOrigin("http://octop.example.com");
  assert.equal(plain.origin, "http://octop.example.com");
  assert.equal(plain.port, 80);
  assert.equal(plain.tls, false);
  const ported = normalizeOrigin("http://127.0.0.1:8765");
  assert.equal(ported.origin, "http://127.0.0.1:8765");
  assert.equal(ported.port, 8765);
  assert.equal(ported.tls, false);
  assert.equal(normalizeOrigin("http://localhost:8765/").origin, "http://localhost:8765");
});

test("a partial remote form is refused and a password never lands in the file", async () => {
  const home = await fs.mkdtemp(join(tmpdir(), "octop-connection-"));
  const store = new ConnectionProfileStore(home);
  assert.deepEqual(await store.load(), { mode: "local", origin: "", username: "" });

  const missing = parseConnectionInput({
    mode: "remote",
    origin: "octop.example.com",
    username: "ada",
    password: "",
    rememberPassword: true,
  });
  assert.equal("error" in missing, true);

  const parsed = parseConnectionInput({
    mode: "remote",
    origin: "https://octop.example.com",
    username: "ada",
    password: "secret-value",
    rememberPassword: true,
  });
  if ("error" in parsed) assert.fail(parsed.error);
  assert.equal(parsed.mode, "remote");
  if (parsed.mode !== "remote") return;
  await store.save({ mode: "remote", origin: parsed.origin.origin, username: parsed.username });
  const text = await fs.readFile(store.path, "utf8");
  assert.equal(text.includes("secret-value"), false);
  assert.equal(text.includes("password"), false);
  if (platform() !== "win32") {
    const mode = (await fs.stat(store.path)).mode & 0o777;
    assert.equal(mode, 0o600);
  }
  await fs.rm(home, { recursive: true, force: true });
});

test("version warnings name both sides and stay quiet on the same major", () => {
  assert.equal(versionWarning("1.2.0", "1.9.0"), null);
  assert.equal(versionWarning("v1.2.0", "1.0.0"), null);
  assert.equal(versionWarning("1.2.0", "2.0.0"), "本机 1.2.0，云端 2.0.0");
  assert.equal(versionWarning("1.2.0", null), "云端未报告版本（本机 1.2.0）");
});
