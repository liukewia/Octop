import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./StatsSection.module.less";

interface StatItem {
  valueKey: string;
  labelKey: string;
}

const STATS: StatItem[] = [
  { valueKey: "stats.channels_val", labelKey: "stats.channels" },
  { valueKey: "stats.personas_val", labelKey: "stats.personas" },
  { valueKey: "stats.command_val", labelKey: "stats.command" },
  { valueKey: "stats.local_val", labelKey: "stats.local" },
];

function useCountUp(target: string, active: boolean) {
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!active) return;
    const num = parseFloat(target);
    const suffix = target.replace(String(Math.floor(num)), "");
    if (isNaN(num)) { setDisplay(target); return; }

    const duration = 1200;
    const steps = 50;
    const increment = num / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(current + increment, num);
      setDisplay(
        (Number.isInteger(num)
          ? Math.round(current).toString()
          : current.toFixed(0)) + suffix,
      );
      if (step >= steps) clearInterval(timer);
    }, duration / steps);

    return () => clearInterval(timer);
  }, [active, target]);

  return display;
}

function StatCard({ valueKey, labelKey }: StatItem) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const rawValue = t(valueKey);
  const display = useCountUp(rawValue, active);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setActive(true); obs.disconnect(); } },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={styles.card}>
      <span className={styles.value}>{display}</span>
      <span className={styles.label}>{t(labelKey)}</span>
    </div>
  );
}

export function StatsSection() {
  return (
    <section className={styles.section}>
      <div className={styles.grid}>
        {STATS.map((s) => (
          <StatCard key={s.valueKey} {...s} />
        ))}
      </div>
    </section>
  );
}
