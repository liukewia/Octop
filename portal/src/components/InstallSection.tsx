import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import octopusAvatar from "@/assets/landing/octopus-avatar.webp";
import octopusType from "@/assets/landing/octopus-type.png";
import underlineInstall from "@/assets/landing/underline-install.svg";
import { EASE_OUT, fadeUp, popIn, rise, staggerParent } from "@/motion";
import styles from "./InstallSection.module.less";

type Method = "script" | "pip" | "docker";
type Platform = "mac" | "win_ps" | "win_cmd";
type Segment = { text: string; tone?: "flag" | "path" | "exec" };

const METHODS: Method[] = ["script", "pip", "docker"];
const PLATFORMS: Platform[] = ["mac", "win_ps", "win_cmd"];

const RELEASE_BASE = "https://finnie-1258344699.cos.ap-guangzhou.myqcloud.com/octop";

const SCRIPT_COMMANDS: Record<Platform, Segment[]> = {
  mac: [
    { text: "curl " },
    { text: "-fsSL", tone: "flag" },
    { text: ` ${RELEASE_BASE}/` },
    { text: "install.sh", tone: "path" },
    { text: " | " },
    { text: "bash", tone: "exec" },
  ],
  win_ps: [
    { text: "irm " },
    { text: `${RELEASE_BASE}/` },
    { text: "install.ps1", tone: "path" },
    { text: " | " },
    { text: "iex", tone: "exec" },
  ],
  win_cmd: [
    { text: "curl " },
    { text: "-fsSL", tone: "flag" },
    { text: ` ${RELEASE_BASE}/` },
    { text: "install.bat", tone: "path" },
    { text: " -o install.bat && " },
    { text: "install.bat", tone: "exec" },
  ],
};

const OTHER_COMMANDS: Record<Exclude<Method, "script">, Segment[]> = {
  pip: [{ text: "pip install " }, { text: "octop", tone: "exec" }],
  docker: [
    { text: "docker compose " },
    { text: "-f", tone: "flag" },
    { text: " docker/docker-compose.yml " },
    { text: "up -d", tone: "exec" },
  ],
};

export function InstallSection() {
  const { t } = useTranslation();
  const [method, setMethod] = useState<Method>("script");
  const [platform, setPlatform] = useState<Platform>("mac");
  const [copied, setCopied] = useState(false);

  const segments = method === "script" ? SCRIPT_COMMANDS[platform] : OTHER_COMMANDS[method];
  const command = segments.map((segment) => segment.text).join("");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className={styles.section} id="install">
      <div className={styles.inner}>
        <motion.div className={styles.intro} {...staggerParent(0.12)}>
          <motion.h2 className={styles.heading} variants={rise}>
            {t("install.title")}
            <img src={underlineInstall} alt="" className={styles.underline} />
          </motion.h2>
          <motion.p className={styles.desc} variants={rise}>
            {t("install.desc")}
          </motion.p>
          <motion.img
            src={octopusType}
            alt=""
            className={styles.mascot}
            variants={popIn}
          />
        </motion.div>

        <motion.div className={styles.panel} {...fadeUp(0.1, 36)}>
          <div className={styles.tabs} role="tablist">
            {METHODS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={method === item}
                className={`${styles.tab} ${method === item ? styles.tabActive : ""}`}
                onClick={() => setMethod(item)}
              >
                {t(`install.methods.${item}`)}
                {method === item ? (
                  <motion.span
                    layoutId="installTabUnderline"
                    className={styles.tabUnderline}
                    transition={{ duration: 0.35, ease: EASE_OUT }}
                  />
                ) : null}
              </button>
            ))}
          </div>

          <div className={styles.body}>
            <span className={styles.avatar}>
              <img src={octopusAvatar} alt="" />
            </span>

            <div className={styles.card}>
              {method === "script" ? (
                <div className={styles.platforms}>
                  {PLATFORMS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`${styles.platform} ${
                        platform === item ? styles.platformActive : ""
                      }`}
                      onClick={() => setPlatform(item)}
                    >
                      {platform === item ? (
                        <motion.span
                          layoutId="installPlatformPill"
                          className={styles.platformPill}
                          transition={{ duration: 0.3, ease: EASE_OUT }}
                        />
                      ) : null}
                      <span className={styles.platformLabel}>{t(`install.platforms.${item}`)}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className={styles.commandBlock}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={method}
                    className={styles.hint}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {t(`install.hints.${method}`)}
                  </motion.p>
                </AnimatePresence>
                <div className={styles.command}>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.code
                      key={`${method}-${platform}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.28, ease: EASE_OUT }}
                    >
                      {segments.map((segment, index) => (
                        <span
                          key={`${segment.text}-${index}`}
                          className={segment.tone ? styles[segment.tone] : undefined}
                        >
                          {segment.text}
                        </span>
                      ))}
                    </motion.code>
                  </AnimatePresence>
                  <motion.button
                    type="button"
                    className={styles.copy}
                    onClick={handleCopy}
                    aria-label={t("install.copy")}
                    title={copied ? t("install.copied") : t("install.copy")}
                    whileHover={{ scale: 1.12 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {copied ? <Check size={18} /> : <Copy size={18} />}
                  </motion.button>
                  <AnimatePresence>
                    {copied ? (
                      <motion.span
                        className={styles.copied}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.22, ease: EASE_OUT }}
                      >
                        {t("install.copied")}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
