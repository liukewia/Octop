import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DesktopUpdatePanel from "./DesktopUpdatePanel";

const installUpdate = vi.fn(() => Promise.resolve());
const openInstaller = vi.fn(() => Promise.resolve());
let pushActivity: (activity: {
  phase: "idle" | "downloading" | "ready" | "installing";
  percent?: number | null;
  received?: number;
  total?: number;
}) => void = () => {};

beforeEach(() => {
  installUpdate.mockClear();
  openInstaller.mockClear();
  window.octopDesktop = {
    getPlatformInfo: vi.fn(),
    openDirectoryPicker: vi.fn(),
    openFilePicker: vi.fn(),
    onBackendReady: () => () => {},
    setWindowChrome: () => {},
    clientSettings: {
      get: vi.fn().mockResolvedValue({
        launchAtLogin: false,
        launchWithoutWindow: false,
        closeBehavior: "quit",
        themeBackground: "system",
        stableOnly: true,
      }),
      set: vi.fn(),
    },
    session: {
      register: vi.fn(),
      renew: vi.fn(),
      revoke: vi.fn(),
    },
    checkForUpdates: vi.fn().mockResolvedValue({
      status: "update-available",
      currentVersion: "1.0.3b1",
      latestVersion: "v1.0.4",
      error: null,
    }),
    installUpdate,
    updateActivity: vi.fn().mockResolvedValue({ phase: "idle" }),
    onUpdateActivity: (callback) => {
      pushActivity = callback;
      return () => {};
    },
    openInstaller,
  };
});

afterEach(() => {
  delete window.octopDesktop;
});

describe("<DesktopUpdatePanel />", () => {
  it("confirms in the page and only then asks the shell to install", async () => {
    const user = userEvent.setup();
    render(<DesktopUpdatePanel />);

    expect(await screen.findByText("v1.0.4")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "advancedSettings.update.deviceLoginButton",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "advancedSettings.update.upgradeButton",
      }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "advancedSettings.update.shellConfirmTitle",
    );
    expect(dialog).toHaveTextContent(
      "advancedSettings.update.shellConfirmBody",
    );
    expect(installUpdate).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", {
        name: "advancedSettings.update.later",
      }),
    );
    expect(installUpdate).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: "advancedSettings.update.upgradeButton",
      }),
    );
    const again = await screen.findByRole("dialog");
    await user.click(
      within(again).getByRole("button", {
        name: "advancedSettings.update.upgradeButton",
      }),
    );
    expect(installUpdate).toHaveBeenCalledOnce();
    expect(installUpdate).toHaveBeenCalledWith();
    expect(
      screen.getByRole("progressbar", {
        name: "advancedSettings.update.shellDownloading",
      }),
    ).toBeInTheDocument();
  });

  it("shows download progress, then tells the user the system installer is open", async () => {
    const user = userEvent.setup();
    render(<DesktopUpdatePanel />);
    await user.click(
      await screen.findByRole("button", {
        name: "advancedSettings.update.upgradeButton",
      }),
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "advancedSettings.update.upgradeButton",
      }),
    );

    act(() => {
      pushActivity({
        phase: "downloading",
        percent: 40,
        received: 40,
        total: 100,
      });
    });
    expect(await screen.findByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
    expect(openInstaller).not.toHaveBeenCalled();

    act(() => {
      pushActivity({ phase: "ready" });
    });
    expect(
      await screen.findByText("advancedSettings.update.shellOpened"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "advancedSettings.update.shellOpenAgain",
      }),
    );
    expect(openInstaller).toHaveBeenCalledOnce();
    expect(openInstaller).toHaveBeenCalledWith();
  });
});
