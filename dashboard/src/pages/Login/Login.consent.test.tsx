import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  policy: vi.fn(),
  login: vi.fn(),
  startOauth: vi.fn(),
}));
vi.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));
vi.mock("../../api/modules/auth", () => ({
  isMfaChallenge: () => false,
  authApi: {
    getLoginPolicy: mocks.policy,
    login: mocks.login,
    startOauth: mocks.startOauth,
    getAuthStatus: () => Promise.resolve({ setup_required: false }),
    getOauthStatus: () =>
      Promise.resolve({
        providers: [
          { kind: "oidc", display_name: "Example SSO", enabled: true },
        ],
      }),
    getCaptcha: () => Promise.resolve({ provider: "none" }),
    getLdapStatus: () => Promise.resolve({ enabled: false, display_name: "" }),
    getPasskeyLoginStatus: () => Promise.resolve({ passwordless_login: false }),
  },
}));
vi.mock("../../utils/locale", () => ({
  applyGuestLocale: () => Promise.resolve(),
  applyUserLocale: () => Promise.resolve(),
}));
vi.mock("./CaptchaField", async () => {
  const { forwardRef, useEffect, useImperativeHandle } = await import("react");
  return {
    default: forwardRef(function Captcha(
      { onReadyChange }: { onReadyChange: (ready: boolean) => void },
      ref,
    ) {
      useEffect(() => {
        onReadyChange(true);
      }, [onReadyChange]);
      useImperativeHandle(ref, () => ({
        getToken: () => Promise.resolve(undefined),
      }));
      return null;
    }),
  };
});
import LoginPage from "./index";

const policy = {
  enabled: true,
  ready: true,
  user_agreement_url: "https://portal.example/terms",
  privacy_policy_url: "https://portal.example/privacy",
};
function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}
function fillCredentials() {
  fireEvent.change(
    screen.getByPlaceholderText(
      /login\.username|用户名或邮箱|username or email/i,
    ),
    { target: { value: "alice" } },
  );
  fireEvent.change(
    screen.getByPlaceholderText(/login\.password|密码|password/i),
    { target: { value: "TestPass12" } },
  );
}
function submit() {
  return screen.getByRole("button", {
    name: /^login\.submit$|^登.?录$|^Sign in$/i,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.policy.mockResolvedValue({ ...policy });
});
describe("Login agreement consent", () => {
  it("is unchecked, links externally, and gates password/SSO until a manual check", async () => {
    renderLogin();
    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    fillCredentials();
    expect(submit()).toBeDisabled();
    fireEvent.click(submit());
    expect(mocks.login).not.toHaveBeenCalled();
    const link = screen.getByRole("link", {
      name: /login\.userAgreement|用户协议|User Agreement/,
    });
    expect(link).toHaveAttribute("href", policy.user_agreement_url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const sso = screen.getByRole("button", {
      name: /Example SSO|login\.oidcWith/,
    });
    expect(sso).toBeDisabled();
    fireEvent.click(checkbox);
    expect(submit()).toBeEnabled();
    expect(sso).toBeEnabled();
    mocks.login.mockRejectedValue(new Error("test refusal"));
    fireEvent.click(submit());
    await waitFor(() =>
      expect(mocks.login).toHaveBeenCalledWith(
        "alice",
        "TestPass12",
        undefined,
        true,
      ),
    );
    fireEvent.click(checkbox);
    expect(submit()).toBeDisabled();
  });
  it("does not persist acceptance when the login page is mounted again", async () => {
    const view = renderLogin();
    fireEvent.click(await screen.findByRole("checkbox"));
    view.unmount();
    renderLogin();
    expect(await screen.findByRole("checkbox")).not.toBeChecked();
  });
  it("hides the checkbox when disabled without restoring remember-me", async () => {
    mocks.policy.mockResolvedValue({ ...policy, enabled: false });
    renderLogin();
    fillCredentials();
    await waitFor(() => expect(submit()).toBeEnabled());
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/login\.remember|记住登录|Remember me/),
    ).not.toBeInTheDocument();
  });
  it("blocks login and explains missing policy URLs", async () => {
    mocks.policy.mockResolvedValue({
      ...policy,
      ready: false,
      user_agreement_url: "",
      privacy_policy_url: "",
    });
    renderLogin();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /login\.policyUnavailable|协议链接尚未配置|Policy links are not configured/,
    );
    expect(screen.getByRole("checkbox")).toBeDisabled();
    fillCredentials();
    expect(submit()).toBeDisabled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("fails closed while config loads or if the request fails", async () => {
    mocks.policy.mockRejectedValue(new Error("offline"));
    renderLogin();
    fillCredentials();
    expect(submit()).toBeDisabled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /login\.policyLoadFailed|无法加载|Unable to load/,
    );
    expect(submit()).toBeDisabled();
  });
});
