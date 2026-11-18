import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, Input } from "antd";
import { Cloud } from "lucide-react";
import { clearAuthToken } from "../../../api";
import { message } from "../../../utils/antdMessage";
import { modal } from "../../../utils/antdModal";
import {
  getDesktopBridge,
  type DesktopConnectionView,
} from "../../../utils/desktopBridge";
import { TabPanelHeader } from "./TabPanelHeader";
import styles from "./UpdateConfig.module.less";

/**
 * Desktop-only cloud connection. The browser build has no shell bridge, so
 * this panel renders nothing there. Saving restarts the app; it does not
 * merge the local database with the remote one.
 */
export default function DesktopConnectionPanel() {
  const { t } = useTranslation();
  const bridge = getDesktopBridge()?.connection;
  const [view, setView] = useState<DesktopConnectionView | null>(null);
  const [origin, setOrigin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void bridge
      ?.get()
      .then((next) => {
        setView(next);
        setOrigin(next.origin);
        setUsername(next.username);
      })
      .catch(() => {});
  }, [bridge]);

  if (!bridge) return null;

  const applyRemote = () => {
    modal.confirm({
      title: t("advancedSettings.connection.confirmTitle"),
      content: t("advancedSettings.connection.confirmBody"),
      okText: t("advancedSettings.connection.save"),
      cancelText: t("advancedSettings.update.later"),
      onOk: async () => {
        setSaving(true);
        try {
          const saved = await bridge.set({
            mode: "remote",
            origin,
            username,
            password,
            rememberPassword: remember,
          });
          if (!saved.ok) {
            message.error(saved.error || t("advancedSettings.connection.failed"));
            return;
          }
          clearAuthToken();
          await bridge.relaunch();
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const applyLocal = () => {
    modal.confirm({
      title: t("advancedSettings.connection.localTitle"),
      content: t("advancedSettings.connection.confirmBody"),
      okText: t("advancedSettings.connection.useLocal"),
      cancelText: t("advancedSettings.update.later"),
      onOk: async () => {
        await bridge.clear();
        clearAuthToken();
        await bridge.relaunch();
      },
    });
  };

  return (
    <section className={`${styles.panel} ${styles.panelConstrained}`}>
      <TabPanelHeader
        icon={<Cloud size={18} />}
        title={t("advancedSettings.connection.title")}
        description={t("advancedSettings.connection.description")}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        <Input
          value={origin}
          placeholder={t("advancedSettings.connection.host")}
          onChange={(event) => setOrigin(event.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Input
          value={username}
          placeholder={t("advancedSettings.connection.username")}
          onChange={(event) => setUsername(event.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Input.Password
          value={password}
          placeholder={t("advancedSettings.connection.password")}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Checkbox checked={remember} onChange={(event) => setRemember(event.target.checked)}>
          {t("advancedSettings.connection.remember")}
        </Checkbox>
        {view?.versionWarning ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--fn-text-tertiary)" }}>{view.versionWarning}</p>
        ) : null}
        <div style={{ display: "flex", gap: 8 }}>
          <Button type="primary" loading={saving} onClick={applyRemote}>
            {t("advancedSettings.connection.save")}
          </Button>
          <Button onClick={applyLocal}>{t("advancedSettings.connection.useLocal")}</Button>
        </div>
      </div>
    </section>
  );
}
