import { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./TechGrid.module.less";

const TECH_ITEMS = [
  { key: "multi_agent", icon: "◈", color: "#3b82f6" },
  { key: "security", icon: "⬡", color: "#60a5fa" },
  { key: "channels", icon: "⬢", color: "#A78BFA" },
  { key: "memory", icon: "◉", color: "#93c5fd" },
  { key: "terminal", icon: "▸", color: "#4ADE80" },
  { key: "browser", icon: "◎", color: "#F472B6" },
  { key: "desktop", icon: "▣", color: "#38BDF8" },
  { key: "acp", icon: "⟳", color: "#3b82f6" },
] as const;

export function TechGrid() {
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section className={styles.section} id="features-tech">
      <div className={styles.header}>
        <h2 className={styles.title}>{t("tech.title")}</h2>
        <p className={styles.subtitle}>{t("tech.subtitle")}</p>
      </div>
      <div ref={sectionRef} className={styles.grid}>
        {TECH_ITEMS.map(({ key, icon, color }, idx) => (
          <div
            key={key}
            className={`${styles.card} ${visible ? styles.cardVisible : ""}`}
            style={
              {
                "--accent": color,
                "--delay": `${idx * 60}ms`,
                transitionDelay: visible ? `${idx * 60}ms` : "0ms",
              } as React.CSSProperties
            }
          >
            <div className={styles.topRow}>
              <span className={styles.icon} style={{ color }}>
                {icon}
              </span>
              <span className={styles.tag}>v1.0</span>
            </div>
            <h3 className={styles.cardTitle}>
              {t(`tech.items.${key}.title`)}
            </h3>
            <p className={styles.cardDesc}>
              {t(`tech.items.${key}.desc`)}
            </p>
            <div className={styles.glowLine} />
          </div>
        ))}
      </div>
    </section>
  );
}
