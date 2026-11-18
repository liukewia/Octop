import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import logoDarkUrl from "./assets/logo_horizontal_dark.png";
import logoWhiteUrl from "./assets/logo_horizontal_white.png";
import { LinuxWindowControls } from "./linux-window-controls";
import { mount } from "./mount";
import "./base.less";
import styles from "./splash.module.less";

/**
 * Splash of the Early Window (§4). The main process loads the Dashboard into
 * this same window once the chosen backend is ready, or replaces this page
 * with the failure Result.
 *
 * Local startup offers a jump to the cloud form. A saved cloud connection
 * keeps this page up during the probe and offers the opposite switch.
 *
 * 顶部 58px 的拖动热区由 base.less 提供，正文区域不参与窗口拖动。
 */

function Splash() {
  const { t } = useTranslation();
  const version = new URLSearchParams(window.location.search).get("version");
  const [choice, setChoice] = useState<"local" | "remote" | null>(null);
  const switched = useRef(false);

  useEffect(() => {
    let stop = false;
    const timer = window.setInterval(() => {
      const get = window.octopDesktop?.connection?.get;
      if (!get) return;
      void get()
        .then((view: { mode: "local" | "remote" }) => {
          if (stop) return;
          stop = true;
          window.clearInterval(timer);
          setChoice(view.mode);
        })
        .catch(() => {});
    }, 200);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  const useLocal = () => {
    if (switched.current) return;
    switched.current = true;
    setChoice("local");
    void window.octopDesktop?.connection?.useLocal();
  };

  return (
    <main className={styles.splash} role="status" aria-live="polite">
      <LinuxWindowControls />
      <div className={styles.stack}>
        <img
          className={`${styles.logo} ${styles.logoLight}`}
          src={logoDarkUrl}
          alt="Octop"
          height={72}
        />
        <img
          className={`${styles.logo} ${styles.logoDark}`}
          src={logoWhiteUrl}
          alt="Octop"
          height={72}
        />
        <p className={styles.status}>
          <span className={styles.spinner} aria-hidden="true">
            <span className={styles.track} />
            <span className={styles.ring} />
          </span>
          {choice === "remote" ? t("splash.remote") : choice === "local" ? t("splash.local") : t("splash.preparing")}
        </p>
        {choice === "remote" ? (
          <button type="button" className={styles.cloud} onClick={useLocal}>
            {t("splash.useLocal")}
          </button>
        ) : choice === "local" ? (
          <button
            type="button"
            className={styles.cloud}
            onClick={() => {
              void window.octopDesktop?.connection?.openForm();
            }}
          >
            {t("splash.openCloud")}
          </button>
        ) : null}
      </div>
      {version ? <p className={styles.version}>{version}</p> : null}
    </main>
  );
}

mount(<Splash />);
