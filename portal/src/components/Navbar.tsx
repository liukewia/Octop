import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { changeLocale } from "@/i18n";
import { readStoredUiLocale, type UiLocale } from "@/utils/localePrefs";
import logoWordmark from "@/assets/landing/logo-wordmark.svg";
import { CHANGELOG_URL, DOCS_URL } from "@/constants/links";
import { EASE_OUT } from "@/motion";
import styles from "./Navbar.module.less";

const NAV_LINKS = [
  { key: "overview", href: "#overview" },
  { key: "changelog", href: CHANGELOG_URL },
  { key: "docs", href: DOCS_URL },
] as const;

export function Navbar() {
  const { t, i18n } = useTranslation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleToggleLang = () => {
    const current = (readStoredUiLocale() ?? i18n.language) as UiLocale;
    void changeLocale(current === "en" ? "zh" : "en");
  };

  return (
    <motion.nav
      className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}
      initial={{ y: -56, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
    >
      <div className={styles.inner}>
        <motion.a
          href="/"
          className={styles.brand}
          aria-label="Octop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <img src={logoWordmark} alt="Octop" className={styles.logo} />
        </motion.a>

        <div className={styles.links}>
          {NAV_LINKS.map((link, index) => (
            <motion.a
              key={link.key}
              className={styles.link}
              href={link.href}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 + index * 0.06, ease: EASE_OUT }}
              {...(link.href.startsWith("http")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {t(`nav.${link.key}`)}
            </motion.a>
          ))}
        </div>

        <motion.div
          className={styles.actions}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: EASE_OUT }}
        >
          <button type="button" className={styles.langBtn} onClick={handleToggleLang}>
            <Languages size={16} strokeWidth={1.8} />
            {t("nav.lang")}
          </button>
        </motion.div>
      </div>
    </motion.nav>
  );
}
