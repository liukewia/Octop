import type { MenuItemConstructorOptions } from "electron";

/**
 * Application menu for Windows/Linux caption bar and macOS native menu bar.
 * Provides a single "Connection Settings…" entry that opens the connection
 * modal for switching between local and remote servers.
 */

const WINDOWS_MENU_COMMANDS = [
  "connectionSettings",
  "close",
  "quit",
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "delete",
  "selectAll",
  "reload",
  "forceReload",
  "toggleDevTools",
  "resetZoom",
  "zoomIn",
  "zoomOut",
  "togglefullscreen",
  "about",
] as const;

export type WindowsMenuCommandId = (typeof WINDOWS_MENU_COMMANDS)[number];

/** A command id the page is allowed to run, or null. */
export function windowsMenuCommandId(value: unknown): WindowsMenuCommandId | null {
  if (typeof value !== "string") return null;
  return WINDOWS_MENU_COMMANDS.includes(value as WindowsMenuCommandId)
    ? (value as WindowsMenuCommandId)
    : null;
}

export interface WindowsMenuCommand {
  kind: "command";
  id: WindowsMenuCommandId;
  label: string;
  accelerator: string | null;
}

export interface WindowsMenuSeparator {
  kind: "separator";
}

export type WindowsMenuEntry = WindowsMenuCommand | WindowsMenuSeparator;

export interface WindowsMenuModel {
  titles: [string, string, string, string];
  menus: [WindowsMenuEntry[], WindowsMenuEntry[], WindowsMenuEntry[], WindowsMenuEntry[]];
}

export interface WindowsAppMenuLabels {
  file: string;
  edit: string;
  view: string;
  help: string;
  about: string;
}

export interface AppMenuHandlers {
  onAbout: () => void;
  onConnectionSettings: () => void;
}

export function windowsAppMenuLabels(locale: string): WindowsAppMenuLabels {
  if (locale.toLowerCase().startsWith("zh")) {
    return {
      file: "文件",
      edit: "编辑",
      view: "视图",
      help: "帮助",
      about: "关于 Octop",
    };
  }
  return {
    file: "File",
    edit: "Edit",
    view: "View",
    help: "Help",
    about: "About Octop",
  };
}

function command(
  id: WindowsMenuCommandId,
  label: string,
  accelerator: string | null,
): WindowsMenuCommand {
  return { kind: "command", id, label, accelerator };
}

/** What the page draws. One list per top-level menu, in title order. */
export function windowsMenuModel(locale: string): WindowsMenuModel {
  const labels = windowsAppMenuLabels(locale);
  const zh = locale.toLowerCase().startsWith("zh");
  const text = (zhLabel: string, enLabel: string) => (zh ? zhLabel : enLabel);

  return {
    titles: [labels.file, labels.edit, labels.view, labels.help],
    menus: [
      [
        command("connectionSettings", text("连接设置…", "Connection Settings…"), "Ctrl+Shift+K"),
        { kind: "separator" },
        command("close", text("关闭", "Close"), "Ctrl+W"),
        { kind: "separator" },
        command("quit", text("退出", "Exit"), null),
      ],
      [
        command("undo", text("撤销", "Undo"), "Ctrl+Z"),
        command("redo", text("重做", "Redo"), "Ctrl+Y"),
        { kind: "separator" },
        command("cut", text("剪切", "Cut"), "Ctrl+X"),
        command("copy", text("复制", "Copy"), "Ctrl+C"),
        command("paste", text("粘贴", "Paste"), "Ctrl+V"),
        command("delete", text("删除", "Delete"), "Delete"),
        { kind: "separator" },
        command("selectAll", text("全选", "Select All"), "Ctrl+A"),
      ],
      [
        command("reload", text("重新加载", "Reload"), "Ctrl+R"),
        command("forceReload", text("强制重新加载", "Force Reload"), "Ctrl+Shift+R"),
        command("toggleDevTools", text("开发者工具", "Toggle Developer Tools"), "Ctrl+Shift+I"),
        { kind: "separator" },
        command("resetZoom", text("实际大小", "Actual Size"), "Ctrl+0"),
        command("zoomIn", text("放大", "Zoom In"), "Ctrl++"),
        command("zoomOut", text("缩小", "Zoom Out"), "Ctrl+-"),
        { kind: "separator" },
        command("togglefullscreen", text("切换全屏", "Toggle Full Screen"), "F11"),
      ],
      [command("about", labels.about, null)],
    ],
  };
}

export function windowsApplicationMenu(
  locale: string,
  onAboutOrHandlers: (() => void) | AppMenuHandlers,
): MenuItemConstructorOptions[] {
  const handlers: AppMenuHandlers =
    typeof onAboutOrHandlers === "function"
      ? {
          onAbout: onAboutOrHandlers,
          onConnectionSettings: () => {},
        }
      : onAboutOrHandlers;

  const model = windowsMenuModel(locale);
  return model.titles.map((label, index) => ({
    label,
    submenu: (model.menus[index] ?? []).map((entry): MenuItemConstructorOptions => {
      if (entry.kind === "separator") return { type: "separator" };
      if (entry.id === "about") return { id: entry.id, label: entry.label, click: handlers.onAbout };
      if (entry.id === "connectionSettings") {
        return {
          id: entry.id,
          label: entry.label,
          accelerator: "CmdOrCtrl+Shift+K",
          click: handlers.onConnectionSettings,
        };
      }
      return { id: entry.id, role: entry.id };
    }),
  }));
}

/** Native macOS top-left menu bar with Connection Settings entry. */
export function macApplicationMenu(
  locale: string,
  handlers: AppMenuHandlers,
): MenuItemConstructorOptions[] {
  const zh = locale.toLowerCase().startsWith("zh");
  const text = (zhLabel: string, enLabel: string) => (zh ? zhLabel : enLabel);
  const connectionItem: MenuItemConstructorOptions = {
    id: "connectionSettings",
    label: text("连接设置…", "Connection Settings…"),
    accelerator: "CmdOrCtrl+Shift+K",
    click: handlers.onConnectionSettings,
  };

  return [
    {
      label: "Octop",
      submenu: [
        { id: "about", label: text("关于 Octop", "About Octop"), click: handlers.onAbout },
        { type: "separator" },
        connectionItem,
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: text("文件", "File"),
      submenu: [{ role: "close" }],
    },
    {
      label: text("编辑", "Edit"),
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    {
      label: text("视图", "View"),
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: text("窗口", "Window"),
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ];
}
