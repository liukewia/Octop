import { useRef, useEffect, useState } from "react";
import { useLang } from "@/store/lang";
import { createT } from "@/i18n";
import styles from "./FeaturesSection.module.css";

const FEATURES = [
  {
    key: "companion",
    icon: "🐙",
    color: "#FF6B4A",
    glow: "rgba(255,107,74,0.25)",
    titleKey: "features.companion.title",
    descKey: "features.companion.desc",
  },
  {
    key: "focus",
    icon: "⚡",
    color: "#00D4FF",
    glow: "rgba(0,212,255,0.25)",
    titleKey: "features.focus.title",
    descKey: "features.focus.desc",
  },
  {
    key: "connect",
    icon: "🔗",
    color: "#A78BFA",
    glow: "rgba(167,139,250,0.25)",
    titleKey: "features.connect.title",
    descKey: "features.connect.desc",
  },
  {
    key: "create",
    icon: "✨",
    color: "#FFD700",
    glow: "rgba(255,215,0,0.25)",
    titleKey: "features.create.title",
    descKey: "features.create.desc",
  },
] as const;

function FeatureCard({
  icon, color, glow, titleKey, descKey,
}: (typeof FEATURES)[number]) {
  const locale = useLang((s) => s.locale);
  const t = createT(locale);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.card} ${visible ? styles.cardVisible : ""}`}
      style={{ "--glow": glow, "--accent": color } as React.CSSProperties}
    >
      <div className={styles.iconWrap} style={{ background: `${color}18` }}>
        <span className={styles.icon}>{icon}</span>
      </div>
      <h3 className={styles.cardTitle} style={{ color }}>{t(titleKey)}</h3>
      <p className={styles.cardDesc}>{t(descKey)}</p>
      <div className={styles.scanLine} />
    </div>
  );
}

export function FeaturesSection() {
  const locale = useLang((s) => s.locale);
  const t = createT(locale);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerVisible, setHeaderVisible] = useState(false);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setHeaderVisible(true); },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section className={styles.section} id="features">
      <div
        ref={headerRef}
        className={`${styles.header} ${headerVisible ? styles.headerVisible : ""}`}
      >
        <h2 className={styles.title}>{t("features.title")}</h2>
        <p className={styles.subtitle}>{t("features.subtitle")}</p>
      </div>

      <div className={styles.grid}>
        {FEATURES.map((f) => (
          <FeatureCard key={f.key} {...f} />
        ))}
      </div>
    </section>
  );
}
