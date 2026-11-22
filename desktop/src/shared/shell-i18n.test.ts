import assert from "node:assert/strict";
import { test } from "node:test";

import { changeShellLanguage, shellLanguage, shellT } from "./shell-i18n";

test("shell language follows the OS tag the same way as the tray", () => {
  assert.equal(shellLanguage("zh-CN"), "zh");
  assert.equal(shellLanguage("ZH-Hans"), "zh");
  assert.equal(shellLanguage("en-US"), "en");
  assert.equal(shellLanguage(""), "en");
  assert.equal(shellLanguage(undefined), "en");
});

test("chinese is the default copy", () => {
  changeShellLanguage("zh-CN");
  assert.equal(shellT("splash.preparing"), "正在准备…");
  assert.equal(shellT("error.title"), "Octop 无法启动");
  assert.equal(shellT("shell.upToDate", { version: "1.2.0" }), "当前版本 1.2.0。");
});

test("english copy is selected from a non-chinese tag", () => {
  changeShellLanguage("en-US");
  assert.equal(shellT("splash.preparing"), "Getting ready…");
  assert.equal(shellT("error.title"), "Octop could not start");
  assert.equal(shellT("shell.ok"), "OK");
  changeShellLanguage("zh-CN");
  assert.equal(shellT("shell.ok"), "好");
});
