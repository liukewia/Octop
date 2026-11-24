import type { AgentNoticeKind, HitlNoticeSubtype } from "./notification/types";

export type DashboardPushEvent = {
  type: "dashboard_push";
  kind: AgentNoticeKind;
  agent_id: string;
  thread_id: string;
  text: string;
  agent_name?: string;
  event_id?: string;
  hitl_subtype?: HitlNoticeSubtype;
};

const VALID_KINDS = new Set<AgentNoticeKind>([
  "hitl_required",
  "task_completed",
  "task_failed",
  "proactive_push",
]);

function parseNoticeKind(raw: unknown): AgentNoticeKind | null {
  if (raw === undefined || raw === null || raw === "") {
    return "proactive_push";
  }
  if (typeof raw === "string" && VALID_KINDS.has(raw as AgentNoticeKind)) {
    return raw as AgentNoticeKind;
  }
  return null;
}

function parseHitlSubtype(raw: unknown): HitlNoticeSubtype | undefined {
  if (raw === "ask" || raw === "approval") return raw;
  return undefined;
}

export function parseDashboardPushFrame(
  raw: unknown,
): DashboardPushEvent | null {
  if (raw === null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== "dashboard_push") return null;
  const kind = parseNoticeKind(obj.kind);
  if (!kind) return null;
  const agentId = typeof obj.agent_id === "string" ? obj.agent_id.trim() : "";
  const threadId =
    typeof obj.thread_id === "string" ? obj.thread_id.trim() : "";
  const text = typeof obj.text === "string" ? obj.text : "";
  if (!agentId) return null;
  // Background cron failure before thread binding may have no thread_id yet;
  // every other notice requires a target thread.
  if (!threadId && kind !== "task_failed") return null;
  // Legacy proactive text pushes require non-empty body copy; structured agent
  // lifecycle events (`hitl_required`, `task_completed`, `task_failed`) have
  // localized fallback copy when `text` is empty.
  if (kind === "proactive_push" && !text.trim()) return null;

  const name = typeof obj.agent_name === "string" ? obj.agent_name.trim() : "";
  const eventId = typeof obj.event_id === "string" ? obj.event_id.trim() : "";
  const hitlSubtype =
    kind === "hitl_required" ? parseHitlSubtype(obj.hitl_subtype) : undefined;
  return {
    type: "dashboard_push",
    kind,
    agent_id: agentId,
    thread_id: threadId,
    text,
    ...(name ? { agent_name: name } : {}),
    ...(eventId ? { event_id: eventId } : {}),
    ...(hitlSubtype ? { hitl_subtype: hitlSubtype } : {}),
  };
}

export function truncatePushText(text: string, max = 240): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/** Build the in-app navigation path for an agent notification. */
export function buildAgentNoticePath(event: {
  agent_id: string;
  thread_id: string;
}): string {
  const agentSeg = encodeURIComponent(event.agent_id);
  if (!event.thread_id) {
    return `/chat/${agentSeg}`;
  }
  return `/chat/${agentSeg}/${encodeURIComponent(event.thread_id)}`;
}

function safeDecodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

/** True when `pathname` is currently viewing `/chat/{agentId}/{threadId}`. */
export function isViewingTargetThread(
  pathname: string,
  agentId: string,
  threadId: string,
): boolean {
  if (!agentId || !threadId) return false;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "chat") return false;
  return (
    safeDecodeSegment(parts[1]) === agentId &&
    safeDecodeSegment(parts[2]) === threadId
  );
}

/**
 * Suppress notifications only when the user's window is visible & focused AND
 * currently viewing the exact target conversation. Any unfocused/hidden window
 * or other route/thread should notify.
 */
export function shouldSuppressAgentNotification(input: {
  visible: boolean;
  focused: boolean;
  pathname: string;
  agentId: string;
  threadId: string;
}): boolean {
  if (!input.visible || !input.focused) return false;
  return isViewingTargetThread(input.pathname, input.agentId, input.threadId);
}

export type TranslateFn = (
  key: string,
  options?: Record<string, unknown>,
) => string;

/** Build localized title and preview body for each agent notification kind. */
export function formatAgentNoticeCopy(
  event: Pick<
    DashboardPushEvent,
    "kind" | "hitl_subtype" | "agent_name" | "text"
  >,
  t: TranslateFn,
): { title: string; body: string } {
  const name = event.agent_name?.trim() || "";
  const trimmedText = event.text.trim();

  switch (event.kind) {
    case "hitl_required": {
      const isAsk = event.hitl_subtype === "ask";
      const title = name
        ? t(
            isAsk
              ? "chat.pushToast.hitlAskTitle"
              : "chat.pushToast.hitlApprovalTitle",
            { name },
          )
        : t(
            isAsk
              ? "chat.pushToast.hitlAskTitleFallback"
              : "chat.pushToast.hitlApprovalTitleFallback",
          );
      const body = truncatePushText(
        trimmedText || t("chat.pushToast.hitlBodyFallback"),
      );
      return { title, body };
    }
    case "task_completed": {
      const title = name
        ? t("chat.pushToast.completedTitle", { name })
        : t("chat.pushToast.completedTitleFallback");
      const body = truncatePushText(
        trimmedText || t("chat.pushToast.completedBodyFallback"),
      );
      return { title, body };
    }
    case "task_failed": {
      const title = name
        ? t("chat.pushToast.failedTitle", { name })
        : t("chat.pushToast.failedTitleFallback");
      const body = truncatePushText(
        trimmedText || t("chat.pushToast.failedBodyFallback"),
      );
      return { title, body };
    }
    case "proactive_push":
    default: {
      const title = name
        ? t("chat.pushToast.title", { name })
        : t("chat.pushToast.titleFallback");
      return { title, body: truncatePushText(trimmedText) };
    }
  }
}

/** How long one tab's claim suppresses a duplicate notification across tabs. */
export const PUSH_HANDLED_TTL_MS = 2_000;

const HANDLED_PREFIX = "octop-push-handled:";
const LOCK_PREFIX = "octop-push-lock:";

export type SystemNotifyPermission =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

export function readSystemNotifyPermission(
  isSecureContext: boolean,
  notification: { permission: string } | undefined,
): SystemNotifyPermission {
  if (!isSecureContext || !notification) return "unsupported";
  const { permission } = notification;
  if (
    permission === "granted" ||
    permission === "denied" ||
    permission === "default"
  ) {
    return permission;
  }
  return "unsupported";
}

export function pushDedupeKey(event: {
  thread_id: string;
  text: string;
  kind?: AgentNoticeKind;
  agent_id?: string;
  event_id?: string;
}): string {
  if (event.event_id) {
    return `evt:${event.event_id}`;
  }
  if (event.kind && event.kind !== "proactive_push") {
    return `${event.kind}\n${event.agent_id ?? ""}\n${event.thread_id}\n${
      event.text
    }`;
  }
  return `${event.thread_id}\n${event.text}`;
}

export function systemNotificationTag(
  threadOrAgentId: string,
  kind?: AgentNoticeKind,
): string {
  if (kind === "hitl_required") {
    return `dash-hitl:${threadOrAgentId}`;
  }
  return `dash-push:${threadOrAgentId}`;
}

/** Same pattern the desktop shell accepts before showing a native popup. */
const DASHBOARD_PUSH_PATH =
  /^\/chat\/[A-Za-z0-9_:%~-]+(?:\/[A-Za-z0-9_:%~-]+)?$/;

export function isDashboardPushPath(path: string): boolean {
  return DASHBOARD_PUSH_PATH.test(path);
}

function hashPushKey(key: string): string {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash, 33) ^ key.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function storageKey(prefix: string, key: string): string {
  return `${prefix}${hashPushKey(key)}`;
}

function stampFresh(raw: string | null, now: number, ttlMs: number): boolean {
  if (!raw) return false;
  const ts = Number(raw.split("@")[0]);
  return Number.isFinite(ts) && now - ts < ttlMs;
}

function sweepPushKeys(storage: Storage, now: number): void {
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const fullKey = storage.key(i);
    if (
      !fullKey ||
      (!fullKey.startsWith(HANDLED_PREFIX) && !fullKey.startsWith(LOCK_PREFIX))
    ) {
      continue;
    }
    if (!stampFresh(storage.getItem(fullKey), now, PUSH_HANDLED_TTL_MS)) {
      stale.push(fullKey);
    }
  }
  for (const fullKey of stale) storage.removeItem(fullKey);
}

export function markPushHandled(
  storage: Storage,
  key: string,
  now = Date.now(),
): void {
  sweepPushKeys(storage, now);
  storage.setItem(storageKey(HANDLED_PREFIX, key), String(now));
}

export function wasPushHandled(
  storage: Storage,
  key: string,
  now = Date.now(),
  ttlMs = PUSH_HANDLED_TTL_MS,
): boolean {
  return stampFresh(
    storage.getItem(storageKey(HANDLED_PREFIX, key)),
    now,
    ttlMs,
  );
}

/** Exclusive claim among tabs that race to show one notification. */
export function claimPushLock(
  storage: Storage,
  key: string,
  tabId: string,
  now = Date.now(),
  ttlMs = PUSH_HANDLED_TTL_MS,
): boolean {
  const fullKey = storageKey(LOCK_PREFIX, key);
  const raw = storage.getItem(fullKey);
  if (raw) {
    const [stamp, owner] = raw.split("@");
    const ts = Number(stamp);
    if (owner && Number.isFinite(ts) && now - ts < ttlMs) return false;
  }
  const token = `${now}@${tabId}`;
  storage.setItem(fullKey, token);
  return storage.getItem(fullKey) === token;
}

/**
 * Claim the right to show a notification across open tabs/windows.
 * Must stay synchronous: a background tab's timers and promises are deferred
 * until the tab is focused, which is too late to raise the notification.
 */
export function claimSystemPush(
  storage: Storage | null,
  key: string,
  tabId: string,
  now = Date.now(),
): boolean {
  if (storage && wasPushHandled(storage, key, now)) return false;
  if (storage && !claimPushLock(storage, key, tabId, now)) return false;
  if (storage) markPushHandled(storage, key, now);
  return true;
}
