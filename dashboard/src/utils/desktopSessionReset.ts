import { clearAuthToken, setAuthToken } from "../api/request";
import {
  getDesktopBridge,
  type DesktopRemoteHandoff,
} from "./desktopBridge";

const HANDOFF_KEY = "octop:remote-handoff";

/**
 * Run before React. Drops a JWT that belonged to another backend, then stores
 * a remote session the shell already finished. Captcha and MFA wait for the
 * login page.
 */
export function adoptDesktopRemoteSession(): void {
  const desktop = getDesktopBridge();
  if (!desktop?.connection?.consumeReset || !desktop.session?.takeRemote) return;
  if (desktop.connection.consumeReset()) clearAuthToken();
  const handoff = desktop.session.takeRemote();
  if (!handoff) return;
  if (handoff.kind === "token") {
    setAuthToken(handoff.access_token, true);
    return;
  }
  sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff));
}

export function readRemoteHandoff(): DesktopRemoteHandoff | null {
  const raw = sessionStorage.getItem(HANDOFF_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(HANDOFF_KEY);
  try {
    const parsed = JSON.parse(raw) as DesktopRemoteHandoff;
    if (parsed.kind === "captcha" || parsed.kind === "mfa") return parsed;
  } catch {
    return null;
  }
  return null;
}
