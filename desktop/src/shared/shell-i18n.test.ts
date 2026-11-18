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
  assert.equal(shellT("splash.remote"), "正在加载云端 Octop…");
  assert.equal(shellT("connect.title"), "连接到云端 Octop");
  assert.equal(shellT("connection.versionSkew", { shellVersion: "1.2.0", remoteVersion: "2.0.0" }), "本机 1.2.0，云端 2.0.0");
});

test("english copy is selected from a non-chinese tag", () => {
  changeShellLanguage("en-US");
  assert.equal(shellT("splash.local"), "Loading the local service…");
  assert.equal(shellT("error.title"), "Octop could not start");
  assert.equal(shellT("connection.needPassword"), "Enter a password");
  changeShellLanguage("zh-CN");
  assert.equal(shellT("connection.needPassword"), "请填写密码");
});
