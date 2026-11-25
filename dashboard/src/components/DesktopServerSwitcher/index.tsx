import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Modal } from "antd";
import { Check, Globe, Laptop, Plus, Trash2 } from "lucide-react";
import { message } from "@/utils/antdMessage";
import {
  getDesktopBridge,
  isDesktopShell,
  type DesktopConnectionState,
} from "../../utils/desktopBridge";
import styles from "./DesktopServerSwitcher.module.less";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Headless connection-settings modal opened exclusively from the desktop app's
 * top-left menu ("Connection Settings…"). Lets the user switch between Local
 * and saved remote servers, remove saved connections, or add a new remote one.
 */
export default function DesktopServerSwitcher() {
  const { t } = useTranslation();
  const [state, setState] = useState<DesktopConnectionState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [switching, setSwitching] = useState(false);

  const bridge = isDesktopShell() ? getDesktopBridge()?.connection : undefined;

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    const load = () => {
      void bridge
        .get()
        .then((next) => {
          if (!cancelled) setState(next);
        })
        .catch(() => {});
    };
    load();
    const offChange = bridge.onChange((next) => {
      if (!cancelled) setState(next);
    });
    const offOpen = bridge.onOpenSwitcher(() => {
      if (!cancelled) {
        load();
        setModalOpen(true);
      }
    });
    return () => {
      cancelled = true;
      offChange();
      offOpen();
    };
  }, [bridge]);

  const handleSwitchLocal = useCallback(async () => {
    if (!bridge || switching) return;
    if (state?.mode === "local") {
      setModalOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await bridge.switchToLocal();
      setModalOpen(false);
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : t("desktopConnection.switchFailed"),
      );
    } finally {
      setSwitching(false);
    }
  }, [bridge, state?.mode, switching, t]);

  const handleSwitchRemote = useCallback(
    async (url: string, label?: string, clearForm = false) => {
      if (!bridge || switching) return;
      const trimmed = url.trim();
      if (!trimmed) {
        message.warning(t("desktopConnection.urlRequired"));
        return;
      }
      setSwitching(true);
      try {
        const next = await bridge.switchToRemote(
          trimmed,
          label?.trim() || undefined,
        );
        if (next.mode === "remote") {
          setModalOpen(false);
          if (clearForm) {
            setUrlInput("");
            setLabelInput("");
          }
        }
      } catch (err) {
        message.error(
          err instanceof Error ? err.message : t("desktopConnection.invalidUrl"),
        );
      } finally {
        setSwitching(false);
      }
    },
    [bridge, switching, t],
  );

  const handleRemoveSaved = useCallback(
    async (url: string) => {
      if (!bridge || switching) return;
      try {
        const next = await bridge.removeSaved(url);
        setState(next);
      } catch {
        // Ignore removal errors
      }
    },
    [bridge, switching],
  );

  if (!bridge) return null;

  const isRemote = state?.mode === "remote" && Boolean(state.remoteUrl);

  return (
    <Modal
      open={modalOpen}
      title={t("desktopConnection.modalTitle")}
      onCancel={() => {
        if (!switching) setModalOpen(false);
      }}
      footer={null}
      width={460}
      destroyOnClose
    >
      <p className={styles.modalHint}>{t("desktopConnection.modalHint")}</p>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          {t("desktopConnection.existingConnections")}
        </div>
        <div className={styles.list} role="menu">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!isRemote}
            className={`${styles.item} ${!isRemote ? styles.itemActive : ""}`}
            disabled={switching}
            onClick={() => void handleSwitchLocal()}
          >
            <Laptop size={16} className={styles.itemIcon} />
            <span className={styles.itemBody}>
              <span className={styles.itemTitle}>
                {t("desktopConnection.localMode")}
              </span>
              <span className={styles.itemSub}>
                {t("desktopConnection.localDesc")}
              </span>
            </span>
            {!isRemote ? <Check size={15} className={styles.checkIcon} /> : null}
          </button>

          {(state?.savedServers ?? []).map((server) => {
            const active = isRemote && state?.remoteUrl === server.url;
            return (
              <div
                key={server.url}
                className={`${styles.serverRow} ${active ? styles.itemActive : ""}`}
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={styles.serverMain}
                  disabled={switching}
                  onClick={() => void handleSwitchRemote(server.url, server.label)}
                >
                  <Globe size={16} className={styles.itemIcon} />
                  <span className={styles.itemBody}>
                    <span className={styles.itemTitle}>
                      {server.label || hostOf(server.url)}
                    </span>
                    <span className={styles.itemSub}>{server.url}</span>
                  </span>
                  {active ? <Check size={15} className={styles.checkIcon} /> : null}
                </button>
                <button
                  type="button"
                  className={styles.removeBtn}
                  aria-label={t("desktopConnection.removeServer")}
                  disabled={switching}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRemoveSaved(server.url);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          {t("desktopConnection.addConnection")}
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="octop-remote-url">
            {t("desktopConnection.urlLabel")}
          </label>
          <Input
            id="octop-remote-url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://octop.example.com"
            onPressEnter={() =>
              void handleSwitchRemote(urlInput, labelInput, true)
            }
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="octop-remote-label">
            {t("desktopConnection.labelLabel")}
          </label>
          <Input
            id="octop-remote-label"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder={t("desktopConnection.labelPlaceholder")}
            onPressEnter={() =>
              void handleSwitchRemote(urlInput, labelInput, true)
            }
          />
        </div>
        <div className={styles.actions}>
          <Button
            type="primary"
            icon={<Plus size={15} />}
            loading={switching}
            disabled={!urlInput.trim()}
            onClick={() => void handleSwitchRemote(urlInput, labelInput, true)}
          >
            {t("desktopConnection.connectButton")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
