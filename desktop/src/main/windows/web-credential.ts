import type { Session, WebContents } from "electron";

import { parseSetCookie, webAuthBootstrapSource } from "../connection/web-credential";

/**
 * Install a document-start script that stores the cloud JWT, then drop it
 * after this navigation so a later reload keeps whatever the page saved.
 */
export async function armWebCredential(contents: WebContents, origin: string, token: string): Promise<void> {
  const dbg = contents.debugger;
  if (!dbg.isAttached()) dbg.attach("1.3");
  const added: unknown = await dbg.sendCommand("Page.addScriptToEvaluateOnNewDocument", {
    source: webAuthBootstrapSource(origin, token),
  });
  const identifier =
    added && typeof added === "object" && typeof (added as { identifier?: unknown }).identifier === "string"
      ? (added as { identifier: string }).identifier
      : "";
  let dropped = false;
  const drop = () => {
    if (dropped) return;
    dropped = true;
    if (identifier) {
      void dbg.sendCommand("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch((err: unknown) => {
        void err;
      });
    }
    if (dbg.isAttached()) dbg.detach();
  };
  const onFail = (_event: unknown, _code: number, _desc: string, _url: string, isMainFrame: boolean) => {
    if (!isMainFrame) return;
    contents.removeListener("did-fail-load", onFail);
    drop();
  };
  contents.on("did-fail-load", onFail);
  contents.once("did-finish-load", () => {
    contents.removeListener("did-fail-load", onFail);
    drop();
  });
}

/** Copy login `Set-Cookie` headers into the window that is about to open that origin. */
export async function applySetCookies(
  ses: Session,
  origin: string,
  headers: readonly string[],
): Promise<void> {
  for (const header of headers) {
    const cookie = parseSetCookie(header);
    if (!cookie) continue;
    const url = new URL(cookie.path || "/", origin);
    await ses.cookies.set({
      url: url.toString(),
      name: cookie.name,
      value: cookie.value,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      path: cookie.path || "/",
      expirationDate:
        cookie.maxAge != null && cookie.maxAge > 0 ? Math.floor(Date.now() / 1000) + cookie.maxAge : undefined,
    });
  }
}
