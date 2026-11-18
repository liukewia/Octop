import type { CredentialCipher } from "../session/device-credential";
import type { BackendTarget } from "./target";
import {
  ConnectionProfileStore,
  normalizeOrigin,
  parseConnectionInput,
  remoteBackend,
  type RemoteOrigin,
  type StoredConnection,
} from "./profile";
import { RemoteLogin, type LoginOutcome, type MfaChallenge } from "./remote-login";
import { RemotePasswordStore } from "./secret";
import { shellT } from "../../shared/shell-i18n";

/**
 * One saved connection for this install. Local mode leaves the sidecar in
 * charge. Remote mode is the only backend for the launch that selects it.
 */

export interface ConnectionView {
  mode: "local" | "remote";
  origin: string;
  username: string;
  hasPassword: boolean;
  versionWarning: string | null;
}

export type RemoteHandoff =
  | { kind: "token"; access_token: string; expires_in: number }
  | { kind: "mfa"; username: string; challenge: MfaChallenge }
  | { kind: "captcha"; username: string }
  | { kind: "cookie" };

export interface ConnectFailure {
  ok: false;
  error: string;
  detail?: string;
}

export class ConnectionController {
  private readonly profile: ConnectionProfileStore;
  private readonly passwords: RemotePasswordStore;
  private readonly fetchImpl: typeof fetch;
  private readonly shellVersion: string;

  private mode: "local" | "remote" = "local";
  private endpoint: RemoteOrigin | null = null;
  private username = "";
  private password: string | null = null;
  private versionWarning: string | null = null;
  private pending: RemoteHandoff | null = null;
  private sessionCookies: readonly string[] = [];
  private challenge: MfaChallenge | null = null;
  private renewUsed = false;
  private resetArmed = false;
  private connectAbort: AbortController | null = null;

  constructor(options: {
    home: string;
    cipher: CredentialCipher;
    shellVersion: string;
    fetchImpl?: typeof fetch;
  }) {
    this.profile = new ConnectionProfileStore(options.home);
    this.passwords = new RemotePasswordStore(options.home, options.cipher);
    this.shellVersion = options.shellVersion;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async load(): Promise<void> {
    const stored = await this.profile.load();
    if (stored.mode !== "remote") {
      this.becomeLocal();
      return;
    }
    this.mode = "remote";
    this.username = stored.username;
    this.password = await this.passwords.read();
    this.endpoint = this.readOrigin(stored);
  }

  view(): ConnectionView {
    return {
      mode: this.mode,
      origin: this.endpoint?.origin ?? "",
      username: this.username,
      hasPassword: this.password !== null && this.password.length > 0,
      versionWarning: this.versionWarning,
    };
  }

  /** Remote origin when this launch is connected to one, otherwise null. */
  backend(): BackendTarget | null {
    if (this.mode !== "remote" || !this.endpoint) return null;
    return remoteBackend(this.endpoint);
  }

  async apply(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
    const parsed = parseConnectionInput(input);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    if (parsed.mode === "local") {
      await this.clear();
      return { ok: true };
    }
    await this.profile.save({
      mode: "remote",
      origin: parsed.origin.origin,
      username: parsed.username,
    });
    this.mode = "remote";
    this.endpoint = parsed.origin;
    this.username = parsed.username;
    this.password = parsed.password;
    this.renewUsed = false;
    if (parsed.rememberPassword) await this.passwords.write(parsed.password);
    else await this.passwords.clear();
    return { ok: true };
  }

  async clear(): Promise<void> {
    await this.profile.clear();
    await this.passwords.clear();
    this.becomeLocal();
  }

  /**
   * Probe and log in. Password-missing, bad origin, 401, and network failures
   * stay on the connection form. Token, MFA, and captcha continue into the Dashboard.
   */
  async connect(): Promise<{ ok: true; handoff: RemoteHandoff } | ConnectFailure> {
    if (this.mode !== "remote") return { ok: false, error: shellT("connection.notRemote") };
    if (!this.endpoint) return { ok: false, error: shellT("connection.savedHostInvalid") };
    if (!this.password) return { ok: false, error: shellT("connection.needPassword") };
    const abort = new AbortController();
    this.connectAbort = abort;
    try {
      const outcome = await this.client(abort.signal).connect();
      if (abort.signal.aborted || this.mode !== "remote") {
        return { ok: false, error: shellT("connection.switchedLocal") };
      }
      return this.accept(outcome);
    } finally {
      if (this.connectAbort === abort) this.connectAbort = null;
    }
  }

  /** Stop an in-flight probe or login. The caller decides what to open next. */
  cancelConnect(): void {
    this.connectAbort?.abort();
  }

  async complete(input: {
    captchaToken?: string;
    mfaCode?: string;
    method?: "totp" | "recovery";
  }): Promise<{ ok: true; access_token?: string; expires_in?: number; mfa?: MfaChallenge } | ConnectFailure> {
    if (this.mode !== "remote" || !this.endpoint || !this.password) {
      return { ok: false, error: shellT("connection.notConfigured") };
    }
    const client = this.client();
    let outcome: LoginOutcome;
    if (input.mfaCode) {
      if (!this.challenge) return { ok: false, error: shellT("connection.mfaExpired") };
      outcome = await client.verifyMfa(this.challenge, input.mfaCode, input.method ?? "totp");
    } else {
      outcome = await client.login(input.captchaToken);
    }
    const accepted = this.accept(outcome);
    if (!accepted.ok) return accepted;
    if (accepted.handoff.kind === "token") {
      return { ok: true, access_token: accepted.handoff.access_token, expires_in: accepted.handoff.expires_in };
    }
    if (accepted.handoff.kind === "mfa") return { ok: true, mfa: accepted.handoff.challenge };
    return { ok: false, error: shellT("connection.needCaptcha") };
  }

  /** One password exchange after a 401. A second call does not hit the network. */
  async renew(): Promise<{ access_token: string; expires_in: number } | null> {
    if (this.mode !== "remote" || !this.endpoint || !this.password) return null;
    if (this.renewUsed) return null;
    this.renewUsed = true;
    const outcome = await this.client().login();
    if (outcome.kind !== "token") return null;
    return { access_token: outcome.accessToken, expires_in: outcome.expiresIn };
  }

  takeHandoff(): RemoteHandoff | null {
    const pending = this.pending;
    this.pending = null;
    return pending;
  }

  /**
   * JWT from the login that just succeeded. Left in place so the page can
   * still take the MFA or captcha handoff; the shell copies the token into
   * the cloud page itself.
   */
  webAccessToken(): string | null {
    return this.pending?.kind === "token" ? this.pending.access_token : null;
  }

  /** `Set-Cookie` lines from the login that just succeeded. Empty for an older server. */
  webCookies(): readonly string[] {
    return this.sessionCookies;
  }

  armReset(): void {
    this.resetArmed = true;
  }

  consumeReset(): boolean {
    const armed = this.resetArmed;
    this.resetArmed = false;
    return armed;
  }

  private becomeLocal(): void {
    this.mode = "local";
    this.endpoint = null;
    this.username = "";
    this.password = null;
    this.versionWarning = null;
    this.pending = null;
    this.sessionCookies = [];
    this.challenge = null;
    this.renewUsed = false;
  }

  private readOrigin(stored: StoredConnection): RemoteOrigin | null {
    if (!stored.origin) return null;
    try {
      return normalizeOrigin(stored.origin);
    } catch {
      return null;
    }
  }

  private client(signal?: AbortSignal): RemoteLogin {
    return new RemoteLogin({
      fetchImpl: this.fetchImpl,
      origin: () => this.endpoint?.origin ?? null,
      username: () => this.username,
      password: () => this.password,
      shellVersion: this.shellVersion,
      signal,
    });
  }

  private accept(outcome: LoginOutcome): { ok: true; handoff: RemoteHandoff } | ConnectFailure {
    if (outcome.kind === "token") {
      this.versionWarning = outcome.versionWarning;
      this.challenge = null;
      this.sessionCookies = outcome.cookies;
      const handoff: RemoteHandoff = {
        kind: "token",
        access_token: outcome.accessToken,
        expires_in: outcome.expiresIn,
      };
      this.pending = handoff;
      return { ok: true, handoff };
    }
    if (outcome.kind === "cookie") {
      this.versionWarning = outcome.versionWarning;
      this.challenge = null;
      this.sessionCookies = outcome.cookies;
      this.pending = null;
      return { ok: true, handoff: { kind: "cookie" } };
    }
    if (outcome.kind === "mfa") {
      this.versionWarning = outcome.versionWarning;
      this.challenge = outcome.challenge;
      this.sessionCookies = [];
      const handoff: RemoteHandoff = {
        kind: "mfa",
        username: this.username,
        challenge: outcome.challenge,
      };
      this.pending = handoff;
      return { ok: true, handoff };
    }
    if (outcome.kind === "captcha") {
      this.versionWarning = outcome.versionWarning;
      this.sessionCookies = [];
      const handoff: RemoteHandoff = { kind: "captcha", username: this.username };
      this.pending = handoff;
      return { ok: true, handoff };
    }
    if (outcome.kind === "unauthorized") return { ok: false, error: outcome.message };
    return { ok: false, error: outcome.message, detail: outcome.detail };
  }
}
