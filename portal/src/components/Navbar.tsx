import { useState, useEffect } from "react";
import { useLang } from "@/store/lang";
import { createT } from "@/i18n";
import logoSvg from "/logo.svg";
import styles from "./Navbar.module.less";

export function Navbar() {
  const locale = useLang((s) => s.locale);
  const toggle = useLang((s) => s.toggle);
  const t = createT(locale);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
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
          <button className={styles.langBtn} onClick={toggle}>
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
