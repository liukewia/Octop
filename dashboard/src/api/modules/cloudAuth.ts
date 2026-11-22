/**
 * Cloud-managed accounts.
 *
 * The local backend stays the only API this page talks to: it brokers a cloud
 * sign-in into a normal local JWT. A cloud account therefore behaves exactly
 * like a local one everywhere else in the Dashboard, except that password,
 * role, and permissions are read-only because the cloud owns them.
 */

import { request } from "../request";
import type { OctopUser } from "./auth";
import { isCloudSessionToken } from "../../utils/jwtClaims";

export { isCloudSessionToken };

export interface CloudAccountStatus {
  enabled: boolean;
  configured: boolean;
  display_name: string;
  issuer: string;
  signup_url: string | null;
  offline_grace_seconds: number;
}

export interface CloudMfaChallenge {
  mfa_required: true;
  cloud: true;
  mfa_token: string | null;
  methods: string[];
  user_hint: string;
}

export interface CloudLoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: OctopUser;
  cloud: true;
  cloud_session_id: string;
  cloud_grace_expires_at: number;
}

export interface CloudAdminConfig {
  configured: boolean;
  enabled: boolean;
  display_name: string;
  base_url: string;
  client_id: string;
  has_secret: boolean;
  allow_admin: boolean;
  auto_provision: boolean;
  sync_permissions: boolean;
  offline_grace_seconds: number;
  request_timeout_seconds: number;
  signup_url: string | null;
  cloud_user_count: number;
}

export interface CloudSyncResult {
  checked: number;
  updated: number;
  failed: number;
  errors: { session_id: string; reason: string }[];
}

/** One active sign-in, as its owner sees it. Timestamps are epoch seconds. */
export interface CloudSessionInfo {
  session_id: string;
  device_label: string | null;
  created_at: number;
  last_seen_at: number;
  cloud_expires_at: number;
  grace_expires_at: number;
  current: boolean;
}

export interface CloudConfigInput {
  enabled: boolean;
  display_name: string;
  base_url: string;
  client_id: string;
  client_secret?: string | null;
  allow_admin: boolean;
  auto_provision: boolean;
  sync_permissions: boolean;
  offline_grace_seconds: number;
  request_timeout_seconds: number;
  signup_url: string | null;
}

export function isCloudMfaChallenge(
  value: CloudLoginResponse | CloudMfaChallenge,
): value is CloudMfaChallenge {
  return (value as CloudMfaChallenge).mfa_required === true;
}

export const cloudAuthApi = {
  status: () => request<CloudAccountStatus>("/auth/cloud/status"),

  login: (
    username: string,
    password: string,
    options: { otp?: string; mfaToken?: string } = {},
  ) =>
    request<CloudLoginResponse | CloudMfaChallenge>("/auth/cloud/login", {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        otp: options.otp,
        mfa_token: options.mfaToken,
      }),
    }),

  /** Renew from an expired local token; the backend holds the refresh token. */
  refresh: (accessToken: string) =>
    request<CloudLoginResponse>("/auth/cloud/refresh", {
      method: "POST",
      body: JSON.stringify({ access_token: accessToken }),
    }),

  logout: () =>
    request<void>("/auth/cloud/logout", {
      method: "POST",
    }),

  /** Active sign-ins for the signed-in person, newest activity first. */
  sessions: () =>
    request<{ sessions: CloudSessionInfo[] }>("/auth/cloud/sessions"),

  revokeSession: (sessionId: string) =>
    request<void>(`/auth/cloud/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    }),

  /** Sign out every other device, keeping the current one. */
  revokeOtherSessions: () =>
    request<{ revoked: number }>("/auth/cloud/sessions", { method: "DELETE" }),
};

export const cloudAdminApi = {
  getConfig: () => request<CloudAdminConfig>("/admin/cloud-account"),

  saveConfig: (body: CloudConfigInput) =>
    request<CloudAdminConfig>("/admin/cloud-account", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  test: () =>
    request<{
      ok: boolean;
      issuer: string;
      service: string;
      version?: string | null;
    }>("/admin/cloud-account/test", { method: "POST" }),

  sync: () =>
    request<CloudSyncResult>("/admin/cloud-account/sync", { method: "POST" }),

  revokeSessions: (userId: number) =>
    request<{ revoked: number }>(`/admin/cloud-account/sessions/${userId}`, {
      method: "DELETE",
    }),
};
