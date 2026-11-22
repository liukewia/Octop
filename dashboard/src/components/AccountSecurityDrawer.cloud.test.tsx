import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const me = vi.fn();
const mfaStatus = vi.fn();

vi.mock("../api/modules/auth", () => ({
  authApi: {
    me: () => me(),
    mfaStatus: () => mfaStatus(),
  },
}));

const sessions = vi.fn();
const revokeSession = vi.fn();
const revokeOtherSessions = vi.fn();

vi.mock("../api/modules/cloudAuth", () => ({
  cloudAuthApi: {
    sessions: () => sessions(),
    revokeSession: (...args: unknown[]) => revokeSession(...args),
    revokeOtherSessions: () => revokeOtherSessions(),
  },
}));

vi.mock("../hooks/useServerTimezone", () => ({
  useServerTimezone: () => "UTC",
}));

vi.mock("@/utils/antdMessage", () => ({
  message: { success: vi.fn(), error: vi.fn() },
}));

import AccountSecurityDrawer from "./AccountSecurityDrawer";

/** The drawer resolves ``/auth/me`` and then the device list; allow for it. */
const FIND = { timeout: 8000 };

const CLOUD_ME = {
  id: 7,
  username: "alice",
  role: "user",
  display_name: "Alice Cloud",
  locale: "zh",
  permissions: ["experts"],
  has_password: false,
  cloud_managed: true,
  cloud_issuer: "https://cloud.example.com",
};

const SESSIONS = {
  sessions: [
    {
      session_id: "s-1",
      device_label: "MacBook",
      created_at: 1_700_000_000,
      last_seen_at: 1_700_000_900,
      cloud_expires_at: 1_700_003_600,
      grace_expires_at: 1_700_605_000,
      current: true,
    },
    {
      session_id: "s-2",
      device_label: "Pixel",
      created_at: 1_700_000_500,
      last_seen_at: 1_700_000_800,
      cloud_expires_at: 1_700_003_600,
      grace_expires_at: 1_700_605_000,
      current: false,
    },
  ],
};

describe("AccountSecurityDrawer for a cloud account", () => {
  beforeEach(() => {
    me.mockReset().mockResolvedValue(CLOUD_ME);
    mfaStatus.mockReset();
    sessions.mockReset().mockResolvedValue(SESSIONS);
    revokeSession.mockReset().mockResolvedValue(undefined);
    revokeOtherSessions.mockReset().mockResolvedValue({ revoked: 1 });
  });

  it("shows the cloud-owned notice and devices instead of local password and MFA", async () => {
    render(<AccountSecurityDrawer open onClose={() => undefined} />);

    expect(
      await screen.findByText("account.cloudManagedTitle", undefined, FIND),
    ).toBeInTheDocument();
    // Password, factors, and recovery codes live in the cloud.
    expect(screen.queryByText("account.changePassword")).toBeNull();
    expect(screen.queryByText("account.securityTotp")).toBeNull();
    expect(mfaStatus).not.toHaveBeenCalled();

    expect(
      await screen.findByText("MacBook", undefined, FIND),
    ).toBeInTheDocument();
    expect(screen.getByText("Pixel")).toBeInTheDocument();
    // The device that carries this request cannot be dropped from here.
    expect(
      screen.getAllByRole("button", { name: "account.cloudRevoke" }),
    ).toHaveLength(1);
  });

  it("drops another device", async () => {
    render(<AccountSecurityDrawer open onClose={() => undefined} />);

    // The other device row is the one that carries a drop action.
    await screen.findByText("Pixel", undefined, FIND);
    fireEvent.click(
      screen.getByRole("button", { name: "account.cloudRevoke" }),
    );

    await waitFor(() => expect(revokeSession).toHaveBeenCalledWith("s-2"));
    expect(sessions).toHaveBeenCalledTimes(2);
  }, 20_000);
});
