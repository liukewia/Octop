import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DesktopServerSwitcher from "./index";

const switchToLocal = vi.fn();
const switchToRemote = vi.fn();
const removeSaved = vi.fn();
let openSwitcherCb: (() => void) | null = null;

beforeEach(() => {
  switchToLocal.mockReset().mockResolvedValue({
    mode: "local",
    remoteUrl: null,
    savedServers: [],
  });
  switchToRemote.mockReset().mockResolvedValue({
    mode: "remote",
    remoteUrl: "https://octop.example.com",
    savedServers: [{ url: "https://octop.example.com", label: "Prod" }],
  });
  removeSaved.mockReset().mockResolvedValue({
    mode: "local",
    remoteUrl: null,
    savedServers: [],
  });
  openSwitcherCb = null;

  window.octopDesktop = {
    getPlatformInfo: vi.fn(),
    openDirectoryPicker: vi.fn(),
    openFilePicker: vi.fn(),
    onBackendReady: () => () => {},
    setWindowChrome: () => {},
    clientSettings: {
      get: vi.fn(),
      set: vi.fn(),
    },
    checkForUpdates: vi.fn(),
    installUpdate: vi.fn(),
    connection: {
      get: vi.fn().mockResolvedValue({
        mode: "local",
        remoteUrl: null,
        savedServers: [{ url: "https://saved.example.com", label: "Team" }],
      }),
      switchToLocal,
      switchToRemote,
      removeSaved,
      onChange: () => () => {},
      onOpenSwitcher: (cb) => {
        openSwitcherCb = cb;
        return () => {
          openSwitcherCb = null;
        };
      },
    },
  };
});

afterEach(() => {
  delete window.octopDesktop;
});

describe("<DesktopServerSwitcher />", () => {
  it("renders nothing on the page until Connection Settings is opened from the menu", async () => {
    const user = userEvent.setup();
    render(<DesktopServerSwitcher />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    act(() => {
      openSwitcherCb?.();
    });

    const savedBtn = await screen.findByRole("menuitemradio", {
      name: /Team/,
    });
    await user.click(savedBtn);
    expect(switchToRemote).toHaveBeenCalledWith(
      "https://saved.example.com",
      "Team",
    );
  });

  it("allows adding a new remote connection inside the modal", async () => {
    const user = userEvent.setup();
    render(<DesktopServerSwitcher />);

    act(() => {
      openSwitcherCb?.();
    });

    const urlInput = await screen.findByPlaceholderText(
      "https://octop.example.com",
    );
    await user.type(urlInput, "https://remote.example.com");
    await user.click(
      screen.getByRole("button", { name: "desktopConnection.connectButton" }),
    );
    expect(switchToRemote).toHaveBeenCalledWith(
      "https://remote.example.com",
      undefined,
    );
  });
});
