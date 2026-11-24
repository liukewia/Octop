export type AgentNoticeKind =
  | "hitl_required"
  | "task_completed"
  | "task_failed"
  | "proactive_push";

export type HitlNoticeSubtype = "ask" | "approval";

export type NotificationCarrier = "desktop" | "browser";

export interface AgentNoticePayload {
  kind: AgentNoticeKind;
  hitlSubtype?: HitlNoticeSubtype;
  agentId: string;
  threadId: string;
  agentName?: string;
  title: string;
  body: string;
  /** Validated in-app route (`/chat/<agent>/<thread>` or `/chat/<agent>`). */
  path: string;
  /** Replacement tag for OS / UI notifications. */
  tag: string;
  /** Cross-tab deduplication key. */
  dedupeKey: string;
}

export type UiPermissionExtra = "enable" | "enabled" | "denied" | "none";

export type OpenUiToastFn = (
  payload: AgentNoticePayload,
  extra: UiPermissionExtra,
) => void;

export interface NotificationAdapter {
  readonly carrier: NotificationCarrier;
  notify(payload: AgentNoticePayload): void | Promise<void>;
  subscribeOpen(onOpen: (path: string) => void): () => void;
}
