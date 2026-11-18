import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  LINUX_AUTOSTART_FILENAME,
  OPENED_AT_LOGIN_ARG,
  START_HIDDEN_ARG,
  commitLoginItem,
  linuxAutostartDir,
  planLoginItem,
  shouldStartHidden,
  type LoginItemRequest,
} from "./login-item";

const base: LoginItemRequest = {
  platform: "win32",
  launchAtLogin: true,
  launchWithoutWindow: false,
  execPath: "C:\\Program Files\\Octop\\Octop.exe",
  appPath: "C:\\dev\\octop",
  packaged: true,
};

test("a manual launch still shows the window", () => {
  assert.equal(
    shouldStartHidden({
      platform: "darwin",
      argv: [],
      wasOpenedAtLogin: false,
      launchWithoutWindow: true,
    }),
    false,
  );
  assert.equal(
    shouldStartHidden({
      platform: "win32",
      argv: ["Octop.exe"],
      wasOpenedAtLogin: false,
      launchWithoutWindow: true,
    }),
    false,
  );
});

test("macOS hides a login launch only when the preference says so", () => {
  assert.equal(
    shouldStartHidden({
      platform: "darwin",
      argv: [],
      wasOpenedAtLogin: true,
      launchWithoutWindow: true,
    }),
    true,
  );
  assert.equal(
    shouldStartHidden({
      platform: "darwin",
      argv: [START_HIDDEN_ARG],
      wasOpenedAtLogin: true,
      launchWithoutWindow: false,
    }),
    false,
  );
});

test("Windows and Linux hide only when the login item passed both flags", () => {
  assert.equal(
    shouldStartHidden({
      platform: "linux",
      argv: ["octop", OPENED_AT_LOGIN_ARG, START_HIDDEN_ARG],
      wasOpenedAtLogin: false,
      launchWithoutWindow: false,
    }),
    true,
  );
  assert.equal(
    shouldStartHidden({
      platform: "win32",
      argv: ["Octop.exe", OPENED_AT_LOGIN_ARG],
      wasOpenedAtLogin: false,
      launchWithoutWindow: true,
    }),
    false,
  );
});

test("Windows registers the executable and the login flags", () => {
  const plan = planLoginItem({ ...base, launchWithoutWindow: true });
  assert.deepEqual(plan.electron, {
    openAtLogin: true,
    path: base.execPath,
    args: [OPENED_AT_LOGIN_ARG, START_HIDDEN_ARG],
  });
  assert.equal(plan.autostart, undefined);
});

test("an unpackaged Windows login item still points Electron at the app", () => {
  const plan = planLoginItem({ ...base, packaged: false });
  assert.deepEqual(plan.electron?.args, [base.appPath, OPENED_AT_LOGIN_ARG]);
});

test("turning Windows login off clears the item without a hidden flag", () => {
  const plan = planLoginItem({ ...base, launchAtLogin: false, launchWithoutWindow: true });
  assert.equal(plan.electron?.openAtLogin, false);
  assert.deepEqual(plan.electron?.args, []);
});

test("macOS only sets openAtLogin", () => {
  const plan = planLoginItem({ ...base, platform: "darwin", launchWithoutWindow: true });
  assert.deepEqual(plan, { electron: { openAtLogin: true } });
});

test("Linux writes an autostart entry and quotes paths that contain spaces", () => {
  const dir = linuxAutostartDir("/home/ada", undefined);
  assert.equal(dir, join("/home/ada", ".config", "autostart"));
  const plan = planLoginItem({
    ...base,
    platform: "linux",
    execPath: "/opt/Octop App/octop",
    packaged: true,
    launchWithoutWindow: true,
    autostartDir: dir,
  });
  assert.equal(plan.electron, undefined);
  assert.equal(plan.autostart?.path, join(dir, LINUX_AUTOSTART_FILENAME));
  assert.match(plan.autostart?.contents ?? "", /Exec="\/opt\/Octop App\/octop"/);
  assert.match(plan.autostart?.contents ?? "", new RegExp(OPENED_AT_LOGIN_ARG));
  assert.match(plan.autostart?.contents ?? "", new RegExp(START_HIDDEN_ARG));
});

test("XDG_CONFIG_HOME replaces ~/.config", () => {
  assert.equal(
    linuxAutostartDir("/home/ada", "/var/config"),
    join("/var/config", "autostart"),
  );
});

test("disabling Linux login removes the autostart file", () => {
  const removed: string[] = [];
  const plan = planLoginItem({
    ...base,
    platform: "linux",
    launchAtLogin: false,
    autostartDir: "/home/ada/.config/autostart",
  });
  commitLoginItem(plan, {
    setElectronLoginItem: () => {
      throw new Error("linux must not call the Electron login API");
    },
    mkdir: () => {
      throw new Error("remove does not create a directory");
    },
    writeFile: () => {
      throw new Error("remove does not write");
    },
    removeFile: (path) => removed.push(path),
  });
  assert.deepEqual(removed, [join("/home/ada/.config/autostart", LINUX_AUTOSTART_FILENAME)]);
});

test("enabling Linux login creates the directory and writes the entry", () => {
  const written: Array<{ path: string; contents: string }> = [];
  const made: string[] = [];
  const plan = planLoginItem({
    ...base,
    platform: "linux",
    autostartDir: "/home/ada/.config/autostart",
  });
  commitLoginItem(plan, {
    setElectronLoginItem: () => {
      throw new Error("linux must not call the Electron login API");
    },
    mkdir: (path) => made.push(path),
    writeFile: (path, contents) => written.push({ path, contents }),
    removeFile: () => {
      throw new Error("enable does not remove");
    },
  });
  assert.deepEqual(made, [dirname(join("/home/ada/.config/autostart", LINUX_AUTOSTART_FILENAME))]);
  assert.equal(written.length, 1);
  const entry = written[0];
  assert.ok(entry);
  assert.match(entry.contents, /Name=Octop/);
});
