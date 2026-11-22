import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock("../../api/modules/auth", () => ({
  authApi: {
    getAuthStatus: () => Promise.resolve({ setup_required: false }),
    getOauthStatus: () => Promise.resolve({ providers: [] }),
    getCaptcha: () => Promise.resolve({ provider: "none" }),
    getLdapStatus: () => Promise.resolve({ enabled: false, display_name: "" }),
    getPasskeyLoginStatus: () => Promise.resolve({ passwordless_login: false }),
    login: vi.fn(),
  },
}));

const cloudLogin = vi.fn();
vi.mock("../../api/modules/cloudAuth", () => ({
  cloudAuthApi: {
    status: () =>
      Promise.resolve({
        enabled: true,
        configured: true,
        display_name: "Octop Cloud",
        issuer: "https://cloud.example.com",
        signup_url: "https://cloud.example.com/signup",
        offline_grace_seconds: 604800,
      }),
    login: (...args: unknown[]) => cloudLogin(...args),
    refresh: vi.fn(),
    logout: vi.fn(),
  },
  isCloudMfaChallenge: (value: { mfa_required?: boolean }) =>
    value.mfa_required === true,
}));

vi.mock("../../utils/locale", () => ({
  applyGuestLocale: () => Promise.resolve(),
  applyUserLocale: () => Promise.resolve(),
}));

vi.mock("./CaptchaField", () => ({
  default: () => null,
}));

import LoginPage from "./index";

describe("Login cloud account entry", () => {
  beforeEach(() => {
    cloudLogin.mockReset();
  });

  it("offers the cloud account source and signs in through it", async () => {
    cloudLogin.mockResolvedValue({
      mfa_required: true,
      cloud: true,
      mfa_token: "challenge",
      methods: ["totp"],
      user_hint: "alice",
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const cloudTab = await screen.findByText(
      /login\.sourceCloud|云端账号|Cloud account/i,
    );
    fireEvent.click(cloudTab);

    fireEvent.change(
      screen.getByPlaceholderText(
        /login\.username|用户名或邮箱|username or email/i,
      ),
      { target: { value: "alice" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText(/login\.password|密码|password/i),
      { target: { value: "pw" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /login\.submit|登录|sign in/i }),
    );

    await waitFor(() => expect(cloudLogin).toHaveBeenCalledWith("alice", "pw"));
    // The cloud's second factor stays on this page with its opaque token.
    expect(
      await screen.findByText(/login\.cloudMfaHint|二次验证码|second factor/i),
    ).toBeInTheDocument();
  });
});
