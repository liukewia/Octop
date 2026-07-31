import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import styles from "./TerminalSection.module.less";

const INSTALL_STEPS = [
  { delay: 0, text: "$ curl -fsSL https://get.octop.ai/install.sh | bash", type: "cmd" },
  { delay: 800, text: "  Detecting platform: darwin/arm64", type: "info" },
  { delay: 1200, text: "✓ Installing Octop...", type: "ok" },
  { delay: 2000, text: "✓ Bootstrapping environment...", type: "ok" },
  { delay: 2800, text: "✓ Done! Run `octop init` to get started.", type: "ok" },
  { delay: 3400, text: "", type: "blank" },
  { delay: 3500, text: "$ octop init", type: "cmd" },
  { delay: 4000, text: "✓ Config written to ~/.octop/config.toml", type: "ok" },
  { delay: 4500, text: "", type: "blank" },
  { delay: 4600, text: "$ octop run", type: "cmd" },
  { delay: 5200, text: "  Server running at http://localhost:7860", type: "info" },
  { delay: 5700, text: "  Dashboard: http://localhost:7860/dashboard", type: "info" },
] as const;

export function TerminalSection() {
  const { t } = useTranslation();
  const [lines, setLines] = useState<typeof INSTALL_STEPS[number][]>([]);
  const [cursor, setCursor] = useState(true);
  const [started, setStarted] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    setLines([]);
    const timers = INSTALL_STEPS.map((step) =>
      setTimeout(() => {
        setLines((prev) => [...prev, step]);
        if (termRef.current) {
          termRef.current.scrollTop = termRef.current.scrollHeight;
        }
      }, step.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [started]);

  useEffect(() => {
    const timer = setInterval(() => setCursor((c) => !c), 530);
    return () => clearInterval(timer);
  }, []);

  const handleCopy = () => {
    const cmd = "curl -fsSL https://get.octop.ai/install.sh | bash";
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {/* clipboard not available */});
  };

  const STEPS_META = [
    { key: "install", icon: "↓" },
    { key: "init", icon: "⚙" },
    { key: "run", icon: "▶" },
    { key: "chat", icon: "💬" },
  ];

  return (
    <section ref={sectionRef} className={styles.section} id="install">
      <div className={styles.header}>
        <h2 className={styles.title}>{t("install.title")}</h2>
        <p className={styles.subtitle}>{t("install.subtitle")}</p>
      </div>

      <div className={styles.layout}>
        {/* Steps */}
        <div className={styles.steps}>
          {STEPS_META.map((s, i) => (
            <div key={s.key} className={styles.step}>
              <div className={styles.stepIcon}>{s.icon}</div>
              <div className={styles.stepText}>
                <span className={styles.stepNum}>0{i + 1}</span>
                <span className={styles.stepLabel}>
                  {t(`install.step${i + 1}`)}
                </span>
              </div>
              {i < 3 && <div className={styles.connector} />}
            </div>
          ))}
        </div>

        {/* Terminal */}
        <div className={styles.terminalWrap}>
          <div className={styles.termHeader}>
            <div className={styles.dots}>
              <span className={styles.dotRed} />
              <span className={styles.dotYellow} />
              <span className={styles.dotGreen} />
            </div>
            <span className={styles.termTitle}>bash</span>
            <button className={styles.copyBtn} onClick={handleCopy}>
              {copied ? t("install.copied") : t("install.copy")}
            </button>
          </div>
          <div ref={termRef} className={styles.termBody}>
            {lines.map((line, i) => (
              <div
                key={i}
                className={`${styles.termLine} ${styles[`type_${line.type}`]}`}
              >
                {line.text}
              </div>
            ))}
            <span className={`${styles.termCursor} ${cursor ? styles.cursorOn : ""}`}>
              █
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
