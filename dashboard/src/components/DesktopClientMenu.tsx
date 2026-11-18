import { useCallback, useEffect, useState } from "react";
import { Segmented, Switch } from "antd";
import { Power } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getDesktopBridge,
  isMacDesktopShell,
  type DesktopClientSettings,
} from "../utils/desktopBridge";
import styles from "./AvatarDropdown.module.less";

/**
 * Shell preferences for this computer. Absent in a browser. Writes go through
 * the desktop bridge, not the account form and not ``config.json``.
 */
export default function DesktopClientMenu() {
  const { t } = useTranslation();
  const bridge = getDesktopBridge();
  const [settings, setSettings] = useState<DesktopClientSettings | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    void bridge.clientSettings
      .get()
      .then((next) => {
        if (!cancelled) setSettings(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const patch = useCallback(
    async (partial: Partial<DesktopClientSettings>) => {
      if (!bridge || !settings) return;
      const previous = settings;
      setSettings({ ...settings, ...partial });
      try {
        setSettings(await bridge.clientSettings.set(partial));
      } catch {
        setSettings(previous);
      }
    },
    [bridge, settings],
  );

  if (!bridge || !settings) return null;

  const keepLabel = isMacDesktopShell()
    ? t("account.desktopCloseDock")
    : t("account.desktopCloseTray");

  return (
    <>
      <div className={styles.menuItemRow}>
        <div className={`${styles.menuItemLabel} ${styles.desktopSwitchLabel}`}>
          <Power size={16} strokeWidth={1.8} />
          <span>{t("account.desktopLaunchAtLogin")}</span>
        </div>
        <Switch
          size="small"
          checked={settings.launchAtLogin}
          aria-label={t("account.desktopLaunchAtLogin")}
          onChange={(checked) => void patch({ launchAtLogin: checked })}
        />
      </div>
      {settings.launchAtLogin ? (
        <div className={styles.menuItemRow}>
          <div
            className={`${styles.menuItemLabel} ${styles.desktopSwitchLabel}`}
          >
            <span className={styles.desktopIndentLabel}>
              {t("account.desktopLaunchWithoutWindow")}
            </span>
          </div>
          <Switch
            size="small"
            checked={settings.launchWithoutWindow}
            aria-label={t("account.desktopLaunchWithoutWindow")}
            onChange={(checked) => void patch({ launchWithoutWindow: checked })}
          />
        </div>
      ) : null}
      <div className={styles.desktopCloseRow}>
        <span className={styles.desktopCloseLabel}>
          {t("account.desktopCloseWindow")}
        </span>
        <Segmented
          block
          size="small"
          aria-label={t("account.desktopCloseWindow")}
          value={settings.closeBehavior}
          options={[
            { label: keepLabel, value: "tray" },
            { label: t("account.desktopCloseQuit"), value: "quit" },
          ]}
          onChange={(value) =>
            void patch({ closeBehavior: value === "quit" ? "quit" : "tray" })
          }
        />
      </div>
    </>
  );
}
