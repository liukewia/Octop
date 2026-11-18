import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import DesktopConnectionPanel from "./DesktopConnectionPanel";

describe("<DesktopConnectionPanel />", () => {
  afterEach(() => {
    delete window.octopDesktop;
  });

  it("renders nothing in a browser", () => {
    render(<DesktopConnectionPanel />);
    expect(screen.queryByText("advancedSettings.connection.title")).not.toBeInTheDocument();
  });

  it("saves a remote connection only after confirmation", async () => {
    const user = userEvent.setup();
    const set = vi.fn().mockResolvedValue({ ok: true });
    const relaunch = vi.fn().mockResolvedValue(undefined);
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
        closeBehavior: "tray",
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
    checkForUpdates: vi.fn(),
    installUpdate: vi.fn(),
      connection: {
        get: vi.fn().mockResolvedValue({
          mode: "local",
          origin: "",
          username: "",
          hasPassword: false,
          versionWarning: null,
        }),
        set,
        clear: vi.fn(),
        connect: vi.fn(),
        openForm: vi.fn(),
        useLocal: vi.fn(),
        relaunch,
        consumeReset: () => false,
      },
    };

    render(<DesktopConnectionPanel />);
    expect(await screen.findByText("advancedSettings.connection.title")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("advancedSettings.connection.host"), "octop.example.com");
    await user.type(screen.getByPlaceholderText("advancedSettings.connection.username"), "ada");
    await user.type(screen.getByPlaceholderText("advancedSettings.connection.password"), "secret");
    await user.click(screen.getByRole("button", { name: "advancedSettings.connection.save" }));

    expect(set).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "advancedSettings.connection.save" }));
    expect(set).toHaveBeenCalledWith({
      mode: "remote",
      origin: "octop.example.com",
      username: "ada",
      password: "secret",
      rememberPassword: true,
    });
  });
});
