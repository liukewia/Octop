import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ParticleCanvas } from "@/components/ParticleCanvas";
import { OctopOrbit } from "@/components/OctopOrbit";
import logoSvg from "/logo.svg";
import styles from "./HeroSection.module.less";

export function HeroSection() {
  const { t, i18n } = useTranslation();

  const title1Ref = useRef<HTMLSpanElement>(null);
  const title2Ref = useRef<HTMLSpanElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const elements = [title1Ref, title2Ref, subtitleRef, descRef, ctaRef];
    elements.forEach((ref, i) => {
      if (!ref.current) return;
      ref.current.style.opacity = "0";
      ref.current.style.transform = "translateY(30px)";
      setTimeout(() => {
        if (!ref.current) return;
        ref.current.style.transition = "opacity 0.7s ease, transform 0.7s ease";
        ref.current.style.opacity = "1";
        ref.current.style.transform = "translateY(0)";
      }, i * 150 + 200);
    });
  }, [i18n.language]);

  const scrollDown = () => {
    window.scrollBy({ top: window.innerHeight * 0.9, behavior: "smooth" });
  };

  return (
    <section className={styles.hero}>
      {/* Particle background */}
      <ParticleCanvas />

      {/* Radial gradient overlay */}
      <div className={styles.overlay} />

      <div className={styles.content}>
        {/* Left: Text */}
        <div className={styles.textSide}>
          <span className={styles.badge}>{t("hero.badge")}</span>

          <h1 className={styles.title}>
            <span ref={title1Ref} className={styles.titleLine}>
              {t("hero.title1")}
            </span>
            <span ref={title2Ref} className={`${styles.titleLine} ${styles.titleAccent}`}>
              {t("hero.title2")}
            </span>
          </h1>

          <p ref={subtitleRef} className={styles.subtitle}>
            {t("hero.subtitle")}
          </p>

          <p ref={descRef} className={styles.desc}>
            {t("hero.desc")}
          </p>

          <div ref={ctaRef} className={styles.ctas}>
            <a
              href="https://github.com/Octop-AI/Octop"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.ctaPrimary}
            >
              {t("hero.cta_primary")}
            </a>
            <a
              href="https://github.com/Octop-AI/Octop"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.ctaSecondary}
            >
              <span className={styles.starIcon}>★</span>
              {t("hero.cta_secondary")}
            </a>
          </div>
        </div>

        {/* Right: Octopus with orbit */}
        <div className={styles.octopSide}>
          <div className={styles.octopWrapper}>
            <OctopOrbit />
            <img src={logoSvg} alt="Octop mascot" className={styles.octopImg} />
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <button className={styles.scrollHint} onClick={scrollDown} aria-label={t("hero.scroll")}>
        <span className={styles.scrollText}>{t("hero.scroll")}</span>
        <span className={styles.scrollArrow}>↓</span>
      </button>
    </section>
  );
}
