import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ClientSettingsStore } from "./client-settings";

test("a missing file uses the shell defaults", () => {
  const store = new ClientSettingsStore(join(mkdtempSync(join(tmpdir(), "octop-settings-")), "desktop-settings.json"));
  assert.deepEqual(store.load(), {
    launchAtLogin: false,
    launchWithoutWindow: false,
    closeBehavior: "tray",
    themeBackground: "system",
    stableOnly: true,
  });
});

test("login preferences round-trip and reject a non-boolean", () => {
  const file = join(mkdtempSync(join(tmpdir(), "octop-settings-")), "desktop-settings.json");
  const store = new ClientSettingsStore(file);
  const saved = store.save({ launchAtLogin: true, launchWithoutWindow: true, closeBehavior: "quit" });
  assert.equal(saved.launchAtLogin, true);
  assert.equal(saved.launchWithoutWindow, true);
  assert.equal(saved.closeBehavior, "quit");
  assert.deepEqual(store.load(), saved);

  const poisoned = new ClientSettingsStore(file);
  const raw = poisoned.load();
  assert.equal(raw.launchWithoutWindow, true);
  const next = poisoned.save({ launchWithoutWindow: "yes" as unknown as boolean });
  assert.equal(next.launchWithoutWindow, false);
});
