import { isRedirectStatus } from "./target";
import { versionWarning } from "./profile";
import { setCookieHeaders } from "./web-credential";
import { shellT } from "../../shared/shell-i18n";

/**
 * Health probe and password login against one remote Octop origin.
 *
 * The password is read from the caller at send time and is not copied into the
 * result. A 401 is a single attempt. Captcha and MFA stop here so the bundled
 * login page can finish them; this module does not register a device credential.
 */

const HEALTH_TIMEOUT_MS = 15_000;
const LOGIN_TIMEOUT_MS = 20_000;

export interface MfaChallenge {
  mfa_required: true;
  mfa_token: string;
  methods: string[];
  user_hint: string;
  locale: string;
}

export type LoginOutcome =
  | {
      kind: "token";
      accessToken: string;
      expiresIn: number;
      cookies: readonly string[];
      version: string | null;
      versionWarning: string | null;
    }
  | {
      kind: "cookie";
      cookies: readonly string[];
      version: string | null;
      versionWarning: string | null;
    }
  | { kind: "mfa"; challenge: MfaChallenge; version: string | null; versionWarning: string | null }
  | { kind: "captcha"; version: string | null; versionWarning: string | null }
  | { kind: "unauthorized"; message: string }
  | { kind: "unreachable"; message: string; detail: string };

export interface RemoteLoginOptions {
  fetchImpl?: typeof fetch;
  origin: () => string | null;
  username: () => string;
  password: () => string | null;
  shellVersion: string;
  /** Aborted when the user leaves this connection for the local sidecar. */
  signal?: AbortSignal;
}

interface HttpResult {
  status: number;
  data: unknown;
  redirected: boolean;
  cookies: readonly string[];
}

function errorCode(data: unknown): string | null {
  if (data === null || typeof data !== "object") return null;
  const error = (data as { error?: { code?: unknown } }).error;
  if (!error || typeof error.code !== "string") return null;
  return error.code;
}

function readMfa(data: unknown): MfaChallenge | null {
  if (data === null || typeof data !== "object") return null;
  const body = data as Record<string, unknown>;
  if (body.mfa_required !== true || typeof body.mfa_token !== "string" || !Array.isArray(body.methods)) {
    return null;
  }
  return {
    mfa_required: true,
    mfa_token: body.mfa_token,
    methods: body.methods.filter((item): item is string => typeof item === "string"),
    user_hint: typeof body.user_hint === "string" ? body.user_hint : "",
    locale: typeof body.locale === "string" ? body.locale : "",
  };
}

function readVersion(data: unknown): string | null {
  if (data === null || typeof data !== "object") return null;
  const version = (data as { version?: unknown }).version;
  return typeof version === "string" && version.trim() ? version.trim() : null;
}

export class RemoteLogin {
  private readonly fetchImpl: typeof fetch;
  private readonly options: RemoteLoginOptions;
  private remoteVersion: string | null = null;

  constructor(options: RemoteLoginOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Probe twice at most, then log in once. A failed probe never posts credentials. */
  async connect(): Promise<LoginOutcome> {
    const health = await this.probe();
    if (health.kind === "unreachable") return health;
    this.remoteVersion = health.version;
    return this.login();
  }

  /** One password login. Used after the probe, for captcha completion, and for a single renewal. */
  async login(captchaToken?: string): Promise<LoginOutcome> {
    const origin = this.options.origin();
    const password = this.options.password();
    if (!origin || !password) {
      return { kind: "unreachable", message: shellT("connection.notConfigured"), detail: "" };
    }
    const body: Record<string, string> = {
      username: this.options.username(),
      password,
    };
    if (captchaToken) body.captcha_token = captchaToken;
    const res = await this.request(`${origin}/api/auth/login`, {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: LOGIN_TIMEOUT_MS,
    });
    return this.classifyLogin(res);
  }

  /** Finish an MFA challenge already issued to this process. The password is not sent again. */
  async verifyMfa(
    challenge: MfaChallenge,
    code: string,
    method: "totp" | "recovery" = "totp",
  ): Promise<LoginOutcome> {
    const origin = this.options.origin();
    if (!origin) return { kind: "unreachable", message: shellT("connection.notConfigured"), detail: "" };
    const res = await this.request(`${origin}/api/auth/mfa/verify`, {
      method: "POST",
      body: JSON.stringify({ mfa_token: challenge.mfa_token, method, code }),
      timeoutMs: LOGIN_TIMEOUT_MS,
    });
    return this.classifyLogin(res);
  }

  private async probe(): Promise<
    { kind: "ok"; version: string | null } | { kind: "unreachable"; message: string; detail: string }
  > {
    const origin = this.options.origin();
    if (!origin) return { kind: "unreachable", message: shellT("connection.notConfigured"), detail: "" };
    let lastDetail = shellT("connection.probeFailed");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await this.request(`${origin}/api/health`, { method: "GET", timeoutMs: HEALTH_TIMEOUT_MS });
      if (res.redirected) {
        lastDetail = shellT("connection.redirected");
        continue;
      }
      if (res.status === 200 && isHealthy(res.data)) {
        return { kind: "ok", version: readVersion(res.data) };
      }
      lastDetail = res.status === 0 ? shellT("connection.cannotReach") : shellT("connection.healthStatus", { status: res.status });
    }
    return { kind: "unreachable", message: shellT("connection.cannotConnect"), detail: lastDetail };
  }

  private classifyLogin(res: HttpResult): LoginOutcome {
    const warning = versionWarning(this.options.shellVersion, this.remoteVersion);
    if (res.redirected) {
      return { kind: "unreachable", message: shellT("connection.loginRedirected"), detail: "redirect" };
    }
    if (res.status === 200) {
      const token = tokenOf(res.data);
      if (token) {
        return {
          kind: "token",
          accessToken: token.accessToken,
          expiresIn: token.expiresIn,
          cookies: res.cookies,
          version: this.remoteVersion,
          versionWarning: warning,
        };
      }
      if (res.cookies.length > 0) {
        return { kind: "cookie", cookies: res.cookies, version: this.remoteVersion, versionWarning: warning };
      }
      const challenge = readMfa(res.data);
      if (challenge) {
        return { kind: "mfa", challenge, version: this.remoteVersion, versionWarning: warning };
      }
    }
    const code = errorCode(res.data);
    if (code === "CAPTCHA_REQUIRED" || code === "CAPTCHA_FAILED") {
      return { kind: "captcha", version: this.remoteVersion, versionWarning: warning };
    }
    if (res.status === 401 || code === "AUTH_FAILED") {
      return { kind: "unauthorized", message: shellT("connection.badCredentials") };
    }
    if (res.status === 0) {
      return { kind: "unreachable", message: shellT("connection.cannotConnect"), detail: shellT("connection.loginFailed") };
    }
    return { kind: "unreachable", message: shellT("connection.rejected", { status: res.status }), detail: `HTTP ${res.status}` };
  }

  private deadline(timeoutMs: number): AbortSignal {
    const timeout = AbortSignal.timeout(timeoutMs);
    const extra = this.options.signal;
    if (!extra) return timeout;
    return AbortSignal.any([timeout, extra]);
  }

  private async request(
    url: string,
    init: { method: string; body?: string; timeoutMs: number },
  ): Promise<HttpResult> {
    try {
      const res = await this.fetchImpl(url, {
        method: init.method,
        headers: init.body ? { "Content-Type": "application/json" } : undefined,
        body: init.body,
        redirect: "manual",
        signal: this.deadline(init.timeoutMs),
      });
      if (isRedirectStatus(res.status)) return { status: res.status, data: null, redirected: true, cookies: [] };
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      return { status: res.status, data, redirected: false, cookies: setCookieHeaders(res.headers) };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { status: 0, data: detail, redirected: false, cookies: [] };
    }
  }
}

function isHealthy(data: unknown): boolean {
  if (data === null || typeof data !== "object") return false;
  const body = data as { ok?: unknown; db?: unknown };
  return body.ok === true && typeof body.db === "boolean";
}

function tokenOf(data: unknown): { accessToken: string; expiresIn: number } | null {
  if (data === null || typeof data !== "object") return null;
  const body = data as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) return null;
  return {
    accessToken: body.access_token,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : 0,
  };
}

/** IPC and the login page see this. It has no password field. */
export function publicLoginResult(outcome: LoginOutcome): {
  ok: boolean;
  error?: string;
  access_token?: string;
  expires_in?: number;
  mfa?: MfaChallenge;
  versionWarning?: string | null;
} {
  if (outcome.kind === "token") {
    return {
      ok: true,
      access_token: outcome.accessToken,
      expires_in: outcome.expiresIn,
      versionWarning: outcome.versionWarning,
    };
  }
  if (outcome.kind === "cookie") return { ok: true, versionWarning: outcome.versionWarning };
  if (outcome.kind === "mfa") {
    return { ok: true, mfa: outcome.challenge, versionWarning: outcome.versionWarning };
  }
  if (outcome.kind === "captcha") return { ok: true, error: "captcha", versionWarning: outcome.versionWarning };
  if (outcome.kind === "unauthorized") return { ok: false, error: outcome.message };
  return { ok: false, error: outcome.message };
}
