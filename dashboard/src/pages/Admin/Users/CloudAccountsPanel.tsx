import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Spin,
  Switch,
  Tag,
} from "antd";
import { Cloud, RefreshCw, Save, ShieldCheck, Wifi } from "lucide-react";
import { useTranslation } from "react-i18next";
import { message } from "@/utils/antdMessage";
import {
  cloudAdminApi,
  type CloudAdminConfig,
  type CloudConfigInput,
} from "../../../api/modules/cloudAuth";
import { apiErrorMessage } from "../../../utils/apiError";
import styles from "./index.module.less";

interface CloudFormValues {
  enabled: boolean;
  display_name: string;
  base_url: string;
  client_id: string;
  client_secret?: string;
  allow_admin: boolean;
  sync_permissions: boolean;
  offline_grace_days: number;
  request_timeout_seconds: number;
  signup_url: string;
}

function toFormValues(config: CloudAdminConfig): CloudFormValues {
  return {
    enabled: config.enabled,
    display_name: config.display_name,
    base_url: config.base_url,
    client_id: config.client_id,
    client_secret: "",
    allow_admin: config.allow_admin,
    sync_permissions: config.sync_permissions,
    offline_grace_days: config.configured
      ? Math.max(0, Math.round(config.offline_grace_seconds / 86400))
      : 7,
    request_timeout_seconds:
      config.request_timeout_seconds >= 3
        ? config.request_timeout_seconds
        : 10,
    signup_url: config.signup_url ?? "",
  };
}

/**
 * Cloud accounts, configured once and then governed upstream.
 *
 * This panel is the only place a local admin decides how much power the cloud
 * has: whether admin can be granted, whether permissions follow the cloud, and
 * how long a signed-in machine keeps working while the cloud is unreachable.
 */
export default function CloudAccountsPanel() {
  const { t } = useTranslation();
  const [form] = Form.useForm<CloudFormValues>();
  const [config, setConfig] = useState<CloudAdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const tRef = useRef(t);
  tRef.current = t;

  const load = useCallback(async () => {
    setLoading(true);
    const translate = tRef.current;
    try {
      const next = await cloudAdminApi.getConfig();
      setConfig(next);
      form.setFieldsValue(toFormValues(next));
    } catch (err) {
      message.error(
        apiErrorMessage(err, translate("cloudAccounts.loadFailed"), translate),
      );
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    let values: CloudFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const body: CloudConfigInput = {
      enabled: values.enabled,
      display_name: values.display_name?.trim() ?? "",
      base_url: values.base_url?.trim() ?? "",
      client_id: values.client_id?.trim() ?? "",
      client_secret: values.client_secret?.trim()
        ? values.client_secret.trim()
        : null,
      allow_admin: values.allow_admin,
      auto_provision: config?.auto_provision ?? true,
      sync_permissions: values.sync_permissions,
      offline_grace_seconds: Math.round(values.offline_grace_days * 86400),
      request_timeout_seconds: values.request_timeout_seconds,
      signup_url: values.signup_url?.trim() ? values.signup_url.trim() : null,
    };
    setSaving(true);
    try {
      const next = await cloudAdminApi.saveConfig(body);
      setConfig(next);
      form.setFieldsValue(toFormValues(next));
      message.success(t("cloudAccounts.saved"));
    } catch (err) {
      message.error(apiErrorMessage(err, t("cloudAccounts.saveFailed"), t));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await cloudAdminApi.test();
      setTestResult({
        ok: true,
        text: t("cloudAccounts.testOk", {
          service: result.service,
          version: result.version ?? "—",
        }),
      });
    } catch (err) {
      setTestResult({
        ok: false,
        text: apiErrorMessage(err, t("cloudAccounts.testFailed"), t),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await cloudAdminApi.sync();
      message.success(
        t("cloudAccounts.syncDone", {
          updated: result.updated,
          checked: result.checked,
        }),
      );
      await load();
    } catch (err) {
      message.error(apiErrorMessage(err, t("cloudAccounts.syncFailed"), t));
    } finally {
      setSyncing(false);
    }
  };

  if (loading && !config) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return (
    <Form<CloudFormValues>
      form={form}
      layout="vertical"
      className={styles.ssoForm}
      initialValues={config ? toFormValues(config) : undefined}
    >
      <div className={styles.ssoSection}>
        <div className={styles.ssoSectionHeader}>
          <span className={styles.ssoSectionTitle}>
            <Cloud size={16} /> {t("cloudAccounts.title")}
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {config?.configured ? (
              <Tag
                className={
                  config.enabled
                    ? styles.ssoStatusTagOn
                    : styles.ssoStatusTagOff
                }
              >
                {config.enabled
                  ? t("cloudAccounts.enabledTag")
                  : t("cloudAccounts.disabledTag")}
              </Tag>
            ) : (
              <Tag className={styles.ssoStatusTagOff}>
                {t("cloudAccounts.unconfigured")}
              </Tag>
            )}
            <Tag>
              {t("cloudAccounts.userCount", {
                count: config?.cloud_user_count ?? 0,
              })}
            </Tag>
          </div>
        </div>
        <p className={styles.ssoSectionHint}>{t("cloudAccounts.intro")}</p>

        <Form.Item
          name="enabled"
          valuePropName="checked"
          style={{ marginBottom: 16 }}
        >
          <Switch
            checkedChildren={t("common.enabled")}
            unCheckedChildren={t("common.disabled")}
          />
        </Form.Item>

        <div className={styles.ssoFieldGrid}>
          <Form.Item
            name="display_name"
            label={t("cloudAccounts.displayName")}
            extra={t("cloudAccounts.displayNameHint")}
          >
            <Input placeholder="Octop Cloud" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="base_url"
            label={t("cloudAccounts.baseUrl")}
            extra={t("cloudAccounts.baseUrlHint")}
            rules={[
              { required: true, message: t("cloudAccounts.baseUrlRequired") },
            ]}
          >
            <Input placeholder="https://cloud.example.com" />
          </Form.Item>
          <Form.Item
            name="client_id"
            label={t("cloudAccounts.clientId")}
            rules={[
              { required: true, message: t("cloudAccounts.clientIdRequired") },
            ]}
          >
            <Input placeholder="octop-desktop" />
          </Form.Item>
          <Form.Item
            name="client_secret"
            label={t("cloudAccounts.clientSecret")}
            extra={
              config?.has_secret
                ? t("cloudAccounts.secretKept")
                : t("cloudAccounts.clientSecretHint")
            }
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="signup_url"
            label={t("cloudAccounts.signupUrl")}
            extra={t("cloudAccounts.signupUrlHint")}
          >
            <Input placeholder="https://cloud.example.com/signup" />
          </Form.Item>
          <Form.Item
            name="offline_grace_days"
            label={t("cloudAccounts.offlineGrace")}
            extra={t("cloudAccounts.offlineGraceHint")}
          >
            <InputNumber min={0} max={30} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="request_timeout_seconds"
            label={t("cloudAccounts.timeout")}
          >
            <InputNumber min={3} max={30} style={{ width: "100%" }} />
          </Form.Item>
        </div>

        <Form.Item
          name="allow_admin"
          label={t("cloudAccounts.allowAdmin")}
          valuePropName="checked"
          style={{ marginBottom: 8 }}
        >
          <Switch aria-label={t("cloudAccounts.allowAdmin")} />
        </Form.Item>
        <p className={styles.ssoSectionHint}>
          {t("cloudAccounts.allowAdminHint")}
        </p>

        <Form.Item
          name="sync_permissions"
          label={t("cloudAccounts.syncPermissions")}
          valuePropName="checked"
          style={{ marginBottom: 8 }}
        >
          <Switch aria-label={t("cloudAccounts.syncPermissions")} />
        </Form.Item>
        <p className={styles.ssoSectionHint}>
          {t("cloudAccounts.syncPermissionsHint")}
        </p>

        {testResult ? (
          <Alert
            className={styles.ssoAlert}
            type={testResult.ok ? "success" : "error"}
            showIcon
            message={testResult.text}
          />
        ) : null}
      </div>

      <div className={styles.ssoFooter}>
        <div className={styles.ssoFooterActions}>
          <Button
            type="primary"
            icon={<Save size={15} />}
            loading={saving}
            onClick={() => void handleSave()}
          >
            {t("cloudAccounts.save")}
          </Button>
          <Button
            icon={<Wifi size={15} />}
            loading={testing}
            onClick={() => void handleTest()}
          >
            {t("cloudAccounts.test")}
          </Button>
          <Button
            icon={<RefreshCw size={15} />}
            loading={syncing}
            onClick={() => void handleSync()}
          >
            {t("cloudAccounts.sync")}
          </Button>
        </div>
        <span className={styles.ssoFooterMeta}>
          <ShieldCheck size={14} /> {t("cloudAccounts.footerHint")}
        </span>
      </div>
    </Form>
  );
}
