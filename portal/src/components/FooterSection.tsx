import { useTranslation } from "react-i18next";
import logoSvg from "/logo.svg";
import styles from "./FooterSection.module.less";

export function FooterSection() {
  const { t } = useTranslation();

  return (
    <footer className={styles.footer}>
      <div className={styles.bgOctop}>
        <img src={logoSvg} alt="" aria-hidden className={styles.octopBg} />
        <div className={styles.gradient} />
      </div>

      <div className={styles.content}>
        <h2 className={styles.tagline}>{t("footer.tagline")}</h2>
        <div className={styles.ctas}>
          <a
            href="https://github.com/Octop-AI/Octop"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.ctaPrimary}
          >
            <span className={styles.star}>★</span>
            {t("footer.cta_primary")}
          </a>
          <a
            href="https://docs.octop.ai"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.ctaSecondary}
          >
            {t("footer.cta_secondary")}
          </a>
        </div>
        <p className={styles.copy}>{t("footer.copyright")}</p>
      </div>
    </footer>
  );
}
