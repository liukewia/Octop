/**
 * Native OS notification for an agent event. Focus + active-thread suppression
 * is decided by the Dashboard trigger layer; clicking brings the window forward
 * and navigates to `path`.
 */

export interface MessageNotice {
  title: string;
  body: string;
  /** In-app chat path: `/chat/<agent>` or `/chat/<agent>/<thread>`. */
  path: string;
  /** Optional replacement key; defaults to `path`. */
  tag?: string;
}

/** Same pattern the Dashboard accepts before navigating (incl. bridge `:`/`%3A` and team `~`). */
const CHAT_PATH = /^\/chat\/[A-Za-z0-9_:%~-]+(?:\/[A-Za-z0-9_:%~-]+)?$/;
const TITLE_MAX = 80;
const BODY_MAX = 240;
const TAG_MAX = 120;

export function parseMessageNotice(raw: unknown): MessageNotice | null {
  if (raw === null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const title = cleanText(obj.title, TITLE_MAX);
  const body = cleanText(obj.body, BODY_MAX);
  const path = typeof obj.path === "string" ? obj.path.trim() : "";
  const tag = cleanText(obj.tag, TAG_MAX);
  if (!title || !body || !CHAT_PATH.test(path)) return null;
  return tag ? { title, body, path, tag } : { title, body, path };
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export interface NoticeHandle {
  show(): void;
  close(): void;
  on(event: "click", listener: () => void): void;
}

export interface NoticeSink {
  isSupported(): boolean;
  create(options: { title: string; body: string }): NoticeHandle;
}

const openByKey = new Map<string, NoticeHandle>();

/** Show `notice`, replacing a popup that is still open for the same tag/chat. */
export function showMessageNotice(notice: MessageNotice, sink: NoticeSink, onClick: () => void): boolean {
  if (!sink.isSupported()) return false;
  const key = notice.tag || notice.path;
  openByKey.get(key)?.close();
  const handle = sink.create({ title: notice.title, body: notice.body });
  handle.on("click", () => {
    if (openByKey.get(key) === handle) openByKey.delete(key);
    onClick();
  });
  openByKey.set(key, handle);
  handle.show();
  return true;
}
