import { useState, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowRight, Github, Globe, MousePointer2 } from "lucide-react";
import heroBgMp4 from "@/assets/landing/hero-bg.mp4";
import heroBgWebp from "@/assets/landing/hero-bg.webp";
import heroChat from "@/assets/landing/hero-chat.webp";
import octopMascotType from "@/assets/landing/octop-mascot-type.webp";
import { DOCS_URL, GITHUB_URL } from "@/constants/links";
import { EASE_OUT, hoverArrow, hoverLift, rise, staggerOnMount } from "@/motion";
import styles from "./HeroSection.module.less";

const CONNECTIVITY_ICON_SIZES = [27, 29, 33];

const FLOAT_IN = { duration: 0.8, delay: 0.7, ease: EASE_OUT };

export function HeroSection() {
  const { t } = useTranslation();
  const heroRef = useRef<HTMLElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const connectivityY = useTransform(scrollYProgress, [0, 1], [0, -110]);
  const metricsY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const scriptY = useTransform(scrollYProgress, [0, 1], [0, -70]);

  return (
    <section className={styles.hero} id="overview" ref={heroRef}>
      <div className={styles.background} aria-hidden="true">
        <img src={heroBgWebp} alt="" className={styles.backgroundImg} />
        <motion.video
          className={`${styles.backgroundImg} ${styles.backgroundVideo}`}
          src={heroBgMp4}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: videoReady ? 1 : 0 }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
          onCanPlay={() => setVideoReady(true)}
        />
        <div className={styles.backgroundFade} />
      </div>

      <motion.div className={styles.inner} {...staggerOnMount(0.09, 0.1)}>
        <motion.a
          className={styles.badge}
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          variants={rise}
          whileHover={{ y: -2 }}
        >
          <Github size={16} className={styles.badgeIcon} />
          <span>
            {t("hero.badge_prefix")}
            <strong>{t("hero.badge_stars")}</strong>
            {t("hero.badge_suffix")}
          </span>
        </motion.a>

        <motion.h1 className={styles.title} variants={rise}>
          <span>{t("hero.title_lead")}</span>
          <img src={octopMascotType} alt="" className={styles.mascot} />
          <span>{t("hero.title_trail")}</span>
        </motion.h1>

        <motion.p className={styles.subtitle} variants={rise}>
          {t("hero.subtitle")}
        </motion.p>

        <motion.div className={styles.ctas} variants={rise}>
          <motion.a className={styles.ctaPrimary} href="#install" {...hoverLift}>
            {t("hero.cta_primary")}
            <motion.span className={styles.ctaArrow} variants={hoverArrow}>
              <ArrowRight size={20} />
            </motion.span>
          </motion.a>
          <motion.a
            className={styles.ctaSecondary}
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            {...hoverLift}
          >
            {t("hero.cta_secondary")}
          </motion.a>
        </motion.div>

        <motion.div className={styles.showcase} variants={rise}>
          <motion.img
            src={heroChat}
            alt={t("hero.screenshot_alt")}
            className={styles.screenshot}
            initial={{ opacity: 0, scale: 0.97, rotateX: 8 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            transition={{ duration: 1.1, delay: 0.45, ease: EASE_OUT }}
          />

          <motion.div
            className={styles.connectivityStack}
            aria-hidden="true"
            style={{ y: connectivityY }}
            initial={{ opacity: 0, x: -32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={FLOAT_IN}
          >
            {CONNECTIVITY_ICON_SIZES.map((iconSize, index) => (
              <div key={iconSize} className={styles[`connectivityCard${index + 1}`]}>
                <span className={styles.connectivityIcon}>
                  <Globe size={iconSize} strokeWidth={1.6} />
                </span>
                <div className={styles.connectivityText}>
                  <p>Connectivity Test</p>
                  {index < 2 ? <p>Routing Connectivity Tests</p> : null}
                </div>
              </div>
            ))}
          </motion.div>

          <motion.div
            className={styles.metrics}
            aria-hidden="true"
            style={{ y: metricsY }}
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={FLOAT_IN}
          >
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>
                <span>Disk</span>
                <span>20%</span>
              </div>
              <div className={styles.metricTrack}>
                <motion.div
                  className={styles.metricFill}
                  initial={{ width: 0 }}
                  animate={{ width: "24%" }}
                  transition={{ duration: 1.2, delay: 1.1, ease: EASE_OUT }}
                />
              </div>
            </div>
            <div className={`${styles.metricCard} ${styles.metricCardFront}`}>
              <div className={styles.metricLabel}>
                <span>Memory</span>
                <span>48%</span>
              </div>
              <div className={styles.metricTrack}>
                <motion.div
                  className={styles.metricFill}
                  initial={{ width: 0 }}
                  animate={{ width: "41%" }}
                  transition={{ duration: 1.2, delay: 1.25, ease: EASE_OUT }}
                />
              </div>
            </div>
            <MousePointer2 size={34} className={styles.metricCursor} />
          </motion.div>

          <motion.div
            className={styles.scriptCard}
            aria-hidden="true"
            style={{ y: scriptY }}
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...FLOAT_IN, delay: 0.82 }}
          >
            <div className={styles.scriptHeader}>
              <span className={styles.scriptBadge}>.sh</span>
            </div>
            <pre className={styles.scriptBody}>
              <span className={styles.scriptShebang}>#!/bin/bash</span>
              {"\n"}check_disk &amp;&amp; check_cpu{"\n"}report_status --json
            </pre>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
