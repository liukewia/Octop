import { App } from "antd";
import { Bell } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { buildDashboardNotifyWsUrl } from "../api/modules/wsNotifications";
import { getAuthToken } from "../api/request";
import { useAgent, type OctopAgent } from "../context/AgentContext";
import { ExpertIcon } from "../pages/Experts/components/iconForName";
import {
  ManagedAvatarMark,
  managedRunnerId,
} from "../pages/Experts/components/ManagedAvatarMark";
import {
  incomingShareProps,
  SharedAvatarMark,
} from "../components/SharedResourceBadge";
import {
  emitSessionEvent,
  invalidateHistory,
} from "../pages/Chat/hooks/chatStore";
import { getDesktopBridge } from "../utils/desktopBridge";
import {
  buildAgentNoticePath,
  formatAgentNoticeCopy,
  isDashboardPushPath,
  isViewingTargetThread,
  markPushHandled,
  parseDashboardPushFrame,
  pushDedupeKey,
  shouldSuppressAgentNotification,
  systemNotificationTag,
} from "../utils/dashboardPushToast";
import {
  createNotificationAdapter,
  type AgentNoticePayload,
  type UiPermissionExtra,
} from "../utils/notification";
import { peekSystemNotifyRegistration } from "../sw-register";
import { publicUrl } from "../utils/publicUrl";
import styles from "./useDashboardPushToast.module.less";

const PING_INTERVAL_MS = 25_000;
const MAX_RETRY_MS = 15_000;

function browserStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    const probe = "octop-push-probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function notificationIcon(): string {
  return new URL(publicUrl("pwa-192.png"), window.location.href).href;
}

function accentForPayload(
  payload: AgentNoticePayload,
  agent?: OctopAgent,
): string {
  if (payload.kind === "task_failed") return "#ef4444";
  if (payload.kind === "hitl_required") return "#f59e0b";
  return agent?.color?.trim() || "#6366f1";
}

function PushToastIcon({ agent }: { agent?: OctopAgent }) {
  const icon =
    agent?.icon_url || agent?.icon_name ? (
      <ExpertIcon
        iconUrl={agent.icon_url}
        iconName={agent.icon_name}
        size={16}
      />
    ) : (
      <Bell size={16} />
    );
  return (
    <span className={styles.icon}>
      <SharedAvatarMark {...incomingShareProps(agent)}>
        <ManagedAvatarMark runner={managedRunnerId(agent)}>
          {icon}
        </ManagedAvatarMark>
      </SharedAvatarMark>
    </span>
  );
}

/**
 * Subscribe to `/api/notifications/ws`, apply agent notification timing and
 * focus-suppression rules, and dispatch through the active carrier adapter
 * (Browser Notification / UI fallback vs. Desktop OS Notification).
 */
export function useDashboardPushToast(): void {
  const { notification } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { refresh, agents } = useAgent();
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const notificationRef = useRef(notification);
  notificationRef.current = notification;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;
  const tRef = useRef(t);
  tRef.current = t;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const tabId = Math.random().toString(36).slice(2);
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let reconnectTimer: number | null = null;

    const openUiToast = (
      payload: AgentNoticePayload,
      extra: UiPermissionExtra,
      noticeKey = payload.tag,
    ) => {
      const agent = agentsRef.current.find(
        (item) => item.agent_id === payload.agentId,
      );
      const accent = accentForPayload(payload, agent);
      notificationRef.current.open({
        key: noticeKey,
        placement: "bottomRight",
        className: styles.notice,
        style: {
          ["--push-accent" as string]: accent,
        },
        message: (
          <span className={styles.header}>
            <PushToastIcon agent={agent} />
            <span className={styles.title}>{payload.title}</span>
          </span>
        ),
        description: (
          <>
            <span className={styles.body}>{payload.body}</span>
            {extra === "enable" ? (
              <button
                type="button"
                className={styles.enable}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (typeof Notification === "undefined") return;
                  void Notification.requestPermission().then((result) => {
                    if (result === "granted") {
                      openUiToast(payload, "enabled", noticeKey);
                    } else if (result === "denied") {
                      openUiToast(payload, "denied", noticeKey);
                    }
                  });
                }}
              >
                {tRef.current("chat.pushToast.enablePermission")}
              </button>
            ) : null}
            {extra === "enabled" ? (
              <span
                className={`${styles.status} ${styles.statusEnabled}`}
                onClick={(event) => event.stopPropagation()}
              >
                {tRef.current("chat.pushToast.enabled")}
              </span>
            ) : null}
            {extra === "denied" ? (
              <span
                className={styles.status}
                onClick={(event) => event.stopPropagation()}
              >
                {tRef.current("chat.pushToast.denied")}
              </span>
            ) : null}
          </>
        ),
        duration: payload.kind === "hitl_required" ? null : 8,
        closable: true,
        onClick: () => {
          notificationRef.current.destroy(noticeKey);
          if (isDashboardPushPath(payload.path)) {
            navigateRef.current(payload.path);
          }
        },
      });
    };

    const adapter = createNotificationAdapter({
      desktopBridge: getDesktopBridge(),
      tabId,
      openUiToast: (payload, extra) => openUiToast(payload, extra),
      onNavigate: (path) => {
        if (isDashboardPushPath(path)) {
          navigateRef.current(path);
        }
      },
      getStorage: browserStorage,
      getIconUrl: notificationIcon,
      peekServiceWorkerRegistration: peekSystemNotifyRegistration,
    });

    const unsubscribeOpen = adapter.subscribeOpen((path) => {
      if (!isDashboardPushPath(path)) return;
      navigateRef.current(path);
    });

    const clearReconnect = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed) return;
      clearReconnect();
      const delay = Math.min(1000 * 2 ** retry, MAX_RETRY_MS);
      retry += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    };

    const rememberHandled = (key: string) => {
      const storage = browserStorage();
      if (storage) markPushHandled(storage, key);
    };

    const connect = () => {
      if (closed) return;
      const token = getAuthToken();
      if (!token) {
        scheduleReconnect();
        return;
      }
      let socket: WebSocket;
      try {
        socket = new WebSocket(buildDashboardNotifyWsUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      if (ws && ws !== socket) {
        const prev = ws;
        ws = null;
        try {
          prev.close();
        } catch {
          // ignore
        }
      }
      ws = socket;
      socket.onopen = () => {
        retry = 0;
      };
      socket.onmessage = (event) => {
        let raw: unknown;
        try {
          raw = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (
          raw &&
          typeof raw === "object" &&
          (raw as { type?: string }).type === "pong"
        ) {
          return;
        }
        const parsed = parseDashboardPushFrame(raw);
        if (!parsed) return;
        void refreshRef.current({ silent: true });

        const currentPathname = pathnameRef.current;
        const viewingSameThread = isViewingTargetThread(
          currentPathname,
          parsed.agent_id,
          parsed.thread_id,
        );

        // Refresh cached history & sidebar when the write happened outside the
        // currently mounted chat stream (e.g. background cron, or another thread).
        // Skip `hitl_required` and live open-thread turns so we do not trigger a
        // redundant history reload over an active stream or approval card.
        if (
          parsed.thread_id &&
          parsed.kind !== "hitl_required" &&
          (parsed.kind === "proactive_push" || !viewingSameThread)
        ) {
          invalidateHistory(parsed.thread_id);
          emitSessionEvent({
            kind: "sessionsChanged",
            sessionId: parsed.thread_id,
            agentId: parsed.agent_id,
          });
        }

        const dedupeKey = pushDedupeKey(parsed);
        const visible = document.visibilityState === "visible";
        const focused = document.hasFocus();
        if (
          shouldSuppressAgentNotification({
            visible,
            focused,
            pathname: currentPathname,
            agentId: parsed.agent_id,
            threadId: parsed.thread_id,
          })
        ) {
          rememberHandled(dedupeKey);
          return;
        }

        const path = buildAgentNoticePath(parsed);
        if (!isDashboardPushPath(path)) return;
        const { title, body } = formatAgentNoticeCopy(parsed, (key, opts) =>
          tRef.current(key, opts),
        );
        const tag = systemNotificationTag(
          parsed.thread_id || parsed.agent_id,
          parsed.kind,
        );
        void adapter.notify({
          kind: parsed.kind,
          hitlSubtype: parsed.hitl_subtype,
          agentId: parsed.agent_id,
          threadId: parsed.thread_id,
          agentName: parsed.agent_name,
          title,
          body,
          path,
          tag,
          dedupeKey,
        });
      };
      socket.onclose = () => {
        if (ws !== socket) return;
        ws = null;
        if (!closed) scheduleReconnect();
      };
    };

    connect();
    const pingTimer = window.setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "ping" }));
        } catch {
          // ignore
        }
      }
    }, PING_INTERVAL_MS);

    return () => {
      closed = true;
      unsubscribeOpen();
      clearReconnect();
      window.clearInterval(pingTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, []);
}
