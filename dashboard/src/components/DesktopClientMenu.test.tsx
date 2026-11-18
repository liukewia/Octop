import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DesktopClientMenu from "./DesktopClientMenu";
import type { DesktopClientSettings } from "../utils/desktopBridge";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "zh" },
  }),
}));

const settings: DesktopClientSettings = {
  launchAtLogin: false,
  launchWithoutWindow: false,
  closeBehavior: "tray",
  themeBackground: "system",
  stableOnly: true,
};

const set = vi.fn((patch: Partial<DesktopClientSettings>) =>
  Promise.resolve({ ...settings, ...patch }),
);

beforeEach(() => {
  set.mockClear();
  Object.assign(settings, {
    launchAtLogin: false,
    launchWithoutWindow: false,
    closeBehavior: "tray",
  });
  window.octopDesktop = {
    getPlatformInfo: vi.fn(),
    openDirectoryPicker: vi.fn(),
    openFilePicker: vi.fn(),
    onBackendReady: () => () => {},
    setWindowChrome: () => {},
    clientSettings: {
      get: vi.fn(() => Promise.resolve({ ...settings })),
      set,
    },
    checkForUpdates: vi.fn(),
    installUpdate: vi.fn(),
  } as unknown as Window["octopDesktop"];
});

describe("DesktopClientMenu", () => {
  it("stays out of a browser", () => {
    delete window.octopDesktop;
    const { container } = render(<DesktopClientMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows launch and close controls, and the hidden-window switch only after launch is on", async () => {
    const view = userEvent.setup();
    render(<DesktopClientMenu />);

    const launch = await screen.findByRole("switch", {
      name: "account.desktopLaunchAtLogin",
    });
    expect(launch).not.toBeChecked();
    expect(
      screen.queryByRole("switch", {
        name: "account.desktopLaunchWithoutWindow",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("account.desktopCloseTray")).toBeInTheDocument();

    await view.click(launch);
    expect(set).toHaveBeenCalledWith({ launchAtLogin: true });
    expect(
      await screen.findByRole("switch", {
        name: "account.desktopLaunchWithoutWindow",
      }),
    ).toBeInTheDocument();
  });

  it("saves close behavior", async () => {
    const view = userEvent.setup();
    render(<DesktopClientMenu />);
    await screen.findByRole("switch", { name: "account.desktopLaunchAtLogin" });
    await view.click(screen.getByText("account.desktopCloseQuit"));
    expect(set).toHaveBeenCalledWith({ closeBehavior: "quit" });
  });
});
