import { useState } from "react";
import { useTranslation } from "react-i18next";
import markUrl from "./assets/octop-mark.svg";
import { LinuxWindowControls } from "./linux-window-controls";
import { mount } from "./mount";
import "./base.less";
import styles from "./connect.module.less";

/**
 * Cloud connection form. Shown in the Early Window when a saved remote profile
 * cannot sign in, or when the user leaves the local sidecar from the splash.
 * Copy stays in this shell page; the Dashboard settings form has its own strings.
 */

function queryValue(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

function ConnectPage() {
  const { t } = useTranslation();
  const [origin, setOrigin] = useState(queryValue("origin"));
  const [username, setUsername] = useState(queryValue("username"));
  const [password, setPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(true);
  const [message, setMessage] = useState(queryValue("message"));
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const bridge = window.octopDesktop?.connection;
    if (!bridge) return;
    setBusy(true);
    setMessage("");
    setDetail("");
    void bridge
      .set({ mode: "remote", origin, username, password, rememberPassword })
      .then(async (saved: { ok: boolean; error?: string; detail?: string }) => {
        if (!saved.ok) {
          setMessage(saved.error ?? t("connect.saveFailed"));
          return;
        }
        const connected = await bridge.connect();
        if (!connected.ok) {
          setMessage(connected.error ?? t("connect.connectFailed"));
          setDetail(connected.detail ?? "");
          setPassword("");
        }
      })
      .finally(() => setBusy(false));
  };

  const useLocal = () => {
    setBusy(true);
    void window.octopDesktop?.connection?.useLocal().then((result: { ok: boolean; error?: string }) => {
      if (!result.ok) setMessage(result.error ?? t("connect.localFailed"));
      setBusy(false);
    });
  };

  return (
    <main className={styles.page}>
      <LinuxWindowControls />
      <form
        className={styles.card}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h1 className={styles.title}>
          <img className={styles.mark} src={markUrl} alt="" width={36} height={26} />
          {t("connect.title")}
        </h1>
        <label className={styles.label}>
          {t("connect.host")}
          <input
            className={styles.field}
            value={origin}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => setOrigin(event.target.value)}
          />
        </label>
        <label className={styles.label}>
          {t("connect.username")}
          <input
            className={styles.field}
            value={username}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className={styles.label}>
          {t("connect.password")}
          <input
            className={styles.field}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={rememberPassword}
            onChange={(event) => setRememberPassword(event.target.checked)}
          />
          {t("connect.remember")}
        </label>
        {message ? <p className={styles.error}>{message}</p> : null}
        {detail ? (
          <details>
            <summary>{t("connect.details")}</summary>
            <pre className={styles.copy}>{detail}</pre>
          </details>
        ) : null}
        <div className={styles.actions}>
          <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={busy}>
            {t("connect.submit")}
          </button>
          <button className={styles.button} type="button" disabled={busy} onClick={useLocal}>
            {t("connect.useLocal")}
          </button>
        </div>
      </form>
    </main>
  );
}

mount(<ConnectPage />);
