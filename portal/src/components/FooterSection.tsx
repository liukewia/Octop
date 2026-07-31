import { useLang } from "@/store/lang";
import { createT } from "@/i18n";
import octopImg from "/octop.png";
import styles from "./FooterSection.module.css";

export function FooterSection() {
  const locale = useLang((s) => s.locale);
  const t = createT(locale);

  return (
    <footer className={styles.footer}>
      <div className={styles.bgOctop}>
        <img src={octopImg} alt="" aria-hidden className={styles.octopBg} />
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
