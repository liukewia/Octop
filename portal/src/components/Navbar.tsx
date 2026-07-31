import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { changeLocale } from "@/i18n";
import { readStoredUiLocale, type UiLocale } from "@/utils/localePrefs";
import logoSvg from "/logo.svg";
import styles from "./Navbar.module.less";

export function Navbar() {
  const { t, i18n } = useTranslation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const handleToggleLang = () => {
    const stored = readStoredUiLocale();
    const current = (stored ?? i18n.language) as UiLocale;
    const next: UiLocale = current === "en" ? "zh" : "en";
    void changeLocale(next);
  };

  return (
    <nav className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
      <div className={styles.inner}>
        <a href="/" className={styles.brand}>
          <img src={logoSvg} alt="Octop" className={styles.logo} />
          <span className={styles.brandName}>Octop</span>
        </a>

        <div className={styles.links}>
          <button className={styles.link} onClick={() => scrollTo("features")}>
            {t("nav.features")}
          </button>
          <button className={styles.link} onClick={() => scrollTo("channels")}>
            {t("nav.channels")}
          </button>
          <button className={styles.link} onClick={() => scrollTo("install")}>
            {t("nav.install")}
          </button>
        </div>

        <div className={styles.actions}>
          <button className={styles.langBtn} onClick={handleToggleLang}>
            {t("nav.lang")}
          </button>
          <a
            href="https://github.com/Octop-AI/Octop"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.githubBtn}
          >
            <span>★</span>
            {t("nav.github")}
          </a>
        </div>
      </div>
    </nav>
  );
}
