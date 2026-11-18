import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { CredentialCipher } from "../session/device-credential";
import { RemotePasswordStore } from "./secret";

function cipher(available: boolean): CredentialCipher {
  return {
    available: async () => available,
    encrypt: async (plain) => `enc:${Buffer.from(plain, "utf8").toString("base64")}`,
    decrypt: async (payload) => Buffer.from(payload.slice(4), "base64").toString("utf8"),
  };
}

test("a keychain stores ciphertext and read() returns the password", async () => {
  const home = await fs.mkdtemp(join(tmpdir(), "octop-remote-secret-"));
  const store = new RemotePasswordStore(home, cipher(true));
  assert.equal(await store.write("s3cret"), true);
  const text = await fs.readFile(store.filePath, "utf8");
  assert.equal(text.includes("s3cret"), false);
  assert.equal(await store.read(), "s3cret");
  await store.clear();
  assert.equal(await store.read(), null);
  await fs.rm(home, { recursive: true, force: true });
});

test("without a keychain the password stays in memory and the file is not written", async () => {
  const home = await fs.mkdtemp(join(tmpdir(), "octop-remote-secret-"));
  const store = new RemotePasswordStore(home, cipher(false));
  assert.equal(await store.write("s3cret"), false);
  await assert.rejects(fs.stat(store.filePath));
  assert.equal(await store.read(), "s3cret");
  await fs.rm(home, { recursive: true, force: true });
});
