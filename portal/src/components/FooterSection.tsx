import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import githubIcon from "@/assets/landing/github.svg";
import logoName from "@/assets/landing/logo_name.png";
import octopGithubQr from "@/assets/landing/octop-github.png";
import octopWechatQr from "@/assets/landing/octop-wechat-group.png";
import wechatIcon from "@/assets/landing/wechat.svg";
import { GITHUB_URL } from "@/constants/links";
import { EASE_OUT, fadeUp } from "@/motion";
import styles from "./FooterSection.module.less";

const CHANNELS = [
  {
    key: "github",
    icon: githubIcon,
    qr: octopGithubQr,
    href: GITHUB_URL,
  },
  {
    key: "wechat",
    icon: wechatIcon,
    qr: octopWechatQr,
    href: undefined,
  },
] as const;

export function FooterSection() {
  const { t } = useTranslation();
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <footer className={styles.footer}>
      <motion.div className={styles.inner} {...fadeUp(0, 20, 0.6)}>
        <img src={logoName} alt="Octop" className={styles.logo} />
        <div className={styles.channels}>
          {CHANNELS.map(({ key, icon, qr, href }) => {
            const label = t(`footer.channels.${key}`);
            return (
              <div
                key={key}
                className={styles.channel}
                onMouseEnter={() => setOpenKey(key)}
                onMouseLeave={() => setOpenKey(null)}
              >
                <a
                  className={styles.channelTrigger}
                  aria-label={label}
                  {...href && {
                    href: href,
                    target: "_blank",
                    rel: "noopener noreferrer",
                  }}
                  onFocus={() => setOpenKey(key)}
                  onBlur={() => setOpenKey(null)}
                >
                  <img src={icon} alt="" width={20} height={20} className={styles.channelIcon} />
                </a>

                <AnimatePresence>
                  {openKey === key ? (
                    <motion.div
                      className={styles.popover}
                      role="tooltip"
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.22, ease: EASE_OUT }}
                    >
                      <img src={qr} alt={label} className={styles.qr} />
                      <span className={styles.qrLabel}>{label}</span>
                      <span className={styles.arrow} aria-hidden="true" />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </motion.div>
    </footer>
  );
}
