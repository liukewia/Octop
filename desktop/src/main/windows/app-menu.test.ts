import assert from "node:assert/strict";
import { test } from "node:test";
import type { MenuItemConstructorOptions } from "electron";

import {
  macApplicationMenu,
  windowsApplicationMenu,
  windowsAppMenuLabels,
  windowsMenuCommandId,
  windowsMenuModel,
} from "./app-menu";

function roles(item: MenuItemConstructorOptions): string[] {
  const submenu = item.submenu;
  assert.ok(Array.isArray(submenu));
  return submenu.flatMap((entry) => (entry.role ? [entry.role] : []));
}

test("菜单名跟随语言", () => {
  assert.deepEqual(windowsAppMenuLabels("zh-CN"), {
    app: "Octop",
    file: "文件",
    edit: "编辑",
    view: "视图",
    help: "帮助",
    about: "关于 Octop",
  });
  assert.deepEqual(windowsAppMenuLabels("en-US"), {
    app: "Octop",
    file: "File",
    edit: "Edit",
    view: "View",
    help: "Help",
    about: "About Octop",
  });
});

test("顶层菜单带上常规命令，云端实例在应用菜单里", () => {
  let abouts = 0;
  let connections = 0;
  const menu = windowsApplicationMenu(
    "zh-CN",
    () => {
      abouts += 1;
    },
    () => {
      connections += 1;
    },
  );
  assert.deepEqual(
    menu.map((item) => item.label),
    ["Octop", "文件", "编辑", "视图", "帮助"],
  );
  assert.deepEqual(roles(menu[1]!), ["close", "quit"]);
  assert.deepEqual(roles(menu[2]!), [
    "undo",
    "redo",
    "cut",
    "copy",
    "paste",
    "delete",
    "selectAll",
  ]);
  assert.deepEqual(roles(menu[3]!), [
    "reload",
    "forceReload",
    "toggleDevTools",
    "resetZoom",
    "zoomIn",
    "zoomOut",
    "togglefullscreen",
  ]);
  const help = menu[4]?.submenu;
  assert.ok(Array.isArray(help));
  assert.equal(help[0]?.label, "关于 Octop");
  help[0]?.click?.({} as never, undefined, {} as never);
  assert.equal(abouts, 1);
  const appMenu = menu[0]?.submenu;
  assert.ok(Array.isArray(appMenu));
  assert.equal(appMenu[0]?.label, "云端实例");
  appMenu[0]?.click?.({} as never, undefined, {} as never);
  assert.equal(connections, 1);
  const file = menu[1]?.submenu;
  assert.ok(Array.isArray(file));
  assert.equal(
    file.some((entry) => entry.label === "云端实例"),
    false,
  );
});

test("页面上的菜单带中文标签和快捷键", () => {
  const model = windowsMenuModel("zh-CN");
  assert.deepEqual(model.titles, ["Octop", "文件", "编辑", "视图", "帮助"]);
  assert.deepEqual(model.menus[0], [
    { kind: "command", id: "connection", label: "云端实例", accelerator: null },
  ]);
  assert.deepEqual(model.menus[1], [
    { kind: "command", id: "close", label: "关闭", accelerator: "Ctrl+W" },
    { kind: "separator" },
    { kind: "command", id: "quit", label: "退出", accelerator: null },
  ]);
  assert.equal(model.menus[2][0]?.kind === "command" && model.menus[2][0].label, "撤销");
  assert.equal(model.menus[4][0]?.kind === "command" && model.menus[4][0].accelerator, null);
});

test("macOS 云端实例在 Octop 菜单里，不在文件菜单", () => {
  let connections = 0;
  const menu = macApplicationMenu("zh-CN", () => {
    connections += 1;
  });
  assert.equal(menu[0]?.label, "Octop");
  const appMenu = menu[0]?.submenu;
  assert.ok(Array.isArray(appMenu));
  const connection = appMenu.find((entry) => entry.label === "云端实例");
  assert.ok(connection);
  connection.click?.({} as never, undefined, {} as never);
  assert.equal(connections, 1);
  assert.equal(menu[1]?.role, "fileMenu");
  assert.equal(macApplicationMenu("en-US", () => {})[0]?.submenu instanceof Array, true);
  const english = macApplicationMenu("en-US", () => {})[0]?.submenu;
  assert.ok(Array.isArray(english));
  assert.equal(
    english.some((entry) => entry.label === "Cloud instance"),
    true,
  );
});

test("英文菜单用 Exit，不接受菜单以外的命令", () => {
  const file = windowsMenuModel("en-US").menus[1];
  const appItem = windowsMenuModel("en-US").menus[0][0];
  assert.equal(appItem?.kind === "command" && appItem.label, "Cloud instance");
  assert.equal(file[2]?.kind === "command" && file[2].label, "Exit");
  assert.equal(windowsMenuCommandId("connection"), "connection");
  assert.equal(windowsMenuCommandId("copy"), "copy");
  assert.equal(windowsMenuCommandId("about"), "about");
  assert.equal(windowsMenuCommandId("new-agent"), null);
  assert.equal(windowsMenuCommandId(0), null);
});
