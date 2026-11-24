import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "antd";
import { RefreshCw, Sparkles } from "lucide-react";
import { modal } from "../../../utils/antdModal";
import {
  getDesktopBridge,
  type DesktopClientSettings,
  type DesktopUpdateActivity,
  type DesktopUpdateCheckResult,
} from "../../../utils/desktopBridge";
import { useUpdateStatus } from "../../../hooks/useUpdateStatus";
import { TabPanelHeader } from "./TabPanelHeader";
import styles from "./UpdateConfig.module.less";

/**
 * Desktop-shell update panel. The shell detects/downloads/installs the whole
 * release (shell + Dashboard + Python runtime); this panel only reads the shell
 * channel preference. Detection only lights the shared update icon; this page
 * is where the version and download progress appear. The shell opens the
 * system installer when the download finishes. It never calls the Python
 * self-update API.
 */
export default function DesktopUpdatePanel() {
  const { t } = useTranslation();
  const { status, refreshStatus } = useUpdateStatus();
  const [settings, setSettings] = useState<DesktopClientSettings | null>(null);
  const [checking, setChecking] = useState(false);
  const [activity, setActivity] = useState<DesktopUpdateActivity>({ phase: "idle" });
  const result: DesktopUpdateCheckResult | null = status
    ? {
        status: status.error
          ? "error"
          : status.has_update
          ? "update-available"
          : "up-to-date",
        currentVersion: status.current_version,
        latestVersion: status.latest_version,
        error: status.error,
      }
    : null;

  useEffect(() => {
    let cancelled = false;
    void getDesktopBridge()
      ?.clientSettings.get()
      .then((next) => {
        if (!cancelled) setSettings(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const bridge = getDesktopBridge();
    let cancelled = false;
    let sawEvent = false;
    const unsubscribe =
      bridge?.onUpdateActivity?.((next) => {
        sawEvent = true;
        if (!cancelled) setActivity(next);
      }) ?? (() => {});
    void bridge
      ?.updateActivity?.()
      .then((next) => {
        if (!cancelled && !sawEvent) setActivity(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleStableOnlyChange = useCallback(
    async (checked: boolean) => {
      setChecking(true);
      try {
        const next = await getDesktopBridge()?.clientSettings.set({
          stableOnly: checked,
        });
        if (next) setSettings(next);
        await refreshStatus(true);
      } catch {
        // Keep the previous setting if the IPC call fails.
      } finally {
        setChecking(false);
      }
    },
    [refreshStatus],
  );

  const handleCheck = useCallback(async () => {
    setChecking(true);
    try {
      await refreshStatus(true);
    } finally {
      setChecking(false);
    }
  }, [refreshStatus]);

  const handleUpgrade = useCallback(() => {
    const latest = result?.latestVersion;
    if (!latest) return;
    // Close immediately. Progress stays on this page; failures stay on the
    // shell's system dialog. Awaiting installUpdate would pin this modal open
    // for the whole download.
    modal.confirm({
      title: t("advancedSettings.update.shellConfirmTitle", {
        version: latest,
      }),
      content: t("advancedSettings.update.shellConfirmBody", {
        current: result?.currentVersion || "—",
      }),
      okText: t("advancedSettings.update.upgradeButton"),
      cancelText: t("advancedSettings.update.later"),
      onOk: () => {
        setActivity({ phase: "downloading", percent: 0, received: 0, total: 0 });
        void getDesktopBridge()
          ?.installUpdate()
          ?.catch(() => setActivity({ phase: "idle" }));
      },
    });
  }, [result, t]);

  const handleOpenAgain = useCallback(() => {
    void getDesktopBridge()
      ?.openInstaller?.()
      ?.catch(() => {});
  }, []);

  const hasUpdate = result?.status === "update-available";
  const busy = activity.phase === "downloading" || activity.phase === "installing";
  const downloadLabel =
    activity.phase === "downloading"
      ? activity.percent === null
        ? t("advancedSettings.update.shellDownloadingUnknown")
        : t("advancedSettings.update.shellDownloading", { percent: activity.percent })
      : null;

  return (
    <div className={styles.container}>
      <TabPanelHeader
        icon={<RefreshCw size={22} />}
        title={t("advancedSettings.update.title")}
        description={t("advancedSettings.update.shellManaged")}
      />

      <section
        className={`${styles.panel} ${styles.panelConstrained}`}
        aria-label={t("advancedSettings.update.panelTitle")}
      >
        <div className={styles.panelTitleRow}>
          <span className={styles.panelTitleIcon}>
            <Sparkles size={16} />
          </span>
          <h3 className={styles.panelTitle}>
            {t("advancedSettings.update.panelTitle")}
          </h3>
        </div>

        <div className={styles.stableOnlyRow}>
          <Switch
            checked={settings?.stableOnly !== false}
            onChange={(checked) => void handleStableOnlyChange(checked)}
            disabled={checking || busy}
          />
          <div className={styles.stableOnlyCopy}>
            <p className={styles.stableOnlyLabel}>
              {t("advancedSettings.update.stableOnlyLabel")}
            </p>
            <p className={styles.stableOnlyHint}>
              {t("advancedSettings.update.stableOnlyHint")}
            </p>
          </div>
        </div>

        <div className={styles.versionGrid}>
          <div className={styles.versionCard}>
            <span className={styles.versionLabel}>
              {t("advancedSettings.update.currentVersion")}
            </span>
            <span className={styles.versionValue}>
              {result?.currentVersion || "—"}
            </span>
          </div>
          <div className={styles.versionCard}>
            <span className={styles.versionLabel}>
              {t("advancedSettings.update.latestVersion")}
            </span>
            <span className={styles.versionValue}>
              {result?.latestVersion ?? (
                <span className={styles.notChecked}>
                  {t("advancedSettings.update.notChecked")}
                </span>
              )}
            </span>
            <div className={styles.versionBadges}>
              {hasUpdate && (
                <span className={styles.badge}>
                  {t("advancedSettings.update.updateAvailable")}
                </span>
              )}
            </div>
          </div>
        </div>

        {result?.status === "error" && (
          <div className={`${styles.alert} ${styles.alertError}`}>
            <span>{result.error}</span>
          </div>
        )}

        {activity.phase === "downloading" && downloadLabel && (
          <div className={styles.progressSection}>
            <div className={styles.progressLabel}>
              <RefreshCw size={13} className={styles.spinning} />
              <span>{downloadLabel}</span>
            </div>
            <div
              className={styles.progressBar}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={activity.percent ?? undefined}
              aria-label={downloadLabel}
            >
              <div
                className={styles.progressFill}
                style={{ width: `${activity.percent ?? 8}%` }}
              />
            </div>
          </div>
        )}

        {activity.phase === "ready" && (
          <p className={styles.stableOnlyHint}>{t("advancedSettings.update.shellOpened")}</p>
        )}

        {activity.phase === "installing" && (
          <div className={styles.progressLabel}>
            <RefreshCw size={13} className={styles.spinning} />
            <span>{t("advancedSettings.update.shellOpening")}</span>
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => void handleCheck()}
            disabled={checking || busy}
          >
            <RefreshCw
              size={14}
              className={checking ? styles.spinning : undefined}
            />
            {checking
              ? t("advancedSettings.update.checking")
              : t("advancedSettings.update.checkButton")}
          </button>

          {hasUpdate && activity.phase !== "ready" && !busy && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleUpgrade}
            >
              {t("advancedSettings.update.upgradeButton")}
            </button>
          )}

          {activity.phase === "ready" && (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleOpenAgain}
            >
              {t("advancedSettings.update.shellOpenAgain")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
