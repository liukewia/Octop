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
    <footer className="relative z-[2] bg-white py-14">
      <motion.div
        className="page-container text-[#666660] flex items-center justify-between gap-8 text-[15px] leading-[25px] tracking-[-0.17px] max-[900px]:flex-col max-[900px]:items-start max-[900px]:gap-5"
        {...fadeUp(0, 20, 0.6)}
      >
        <img src={logoName} alt="Octop" className="w-[100px] shrink-0 object-contain" />
        <div className="flex items-center gap-5">
          {CHANNELS.map(({ key, icon, qr, href }) => {
            const label = t(`footer.channels.${key}`);
            return (
              <div
                key={key}
                className="relative"
                onMouseEnter={() => setOpenKey(key)}
                onMouseLeave={() => setOpenKey(null)}
              >
                <a
                  className="text-ink-secondary hover:text-ink hover:border-line-strong group inline-flex size-[38px] items-center justify-center rounded-full border border-line-subtle bg-white transition-[color,border-color,opacity] duration-200 ease-out"
                  aria-label={label}
                  {...(href && {
                    href: href,
                    target: "_blank",
                    rel: "noopener noreferrer",
                  })}
                  onFocus={() => setOpenKey(key)}
                  onBlur={() => setOpenKey(null)}
                >
                  <img
                    src={icon}
                    alt=""
                    width={20}
                    height={20}
                    className="block size-5 opacity-[0.72] transition-opacity duration-200 ease-out group-hover:opacity-100"
                  />
                </a>

                <AnimatePresence>
                  {openKey === key ? (
                    <motion.div
                      className="absolute right-0 bottom-[calc(100%+14px)] flex w-[152px] origin-bottom-right flex-col items-center gap-2 rounded-landing-md border border-line-subtle bg-white p-3 shadow-[0_12px_32px_rgba(0,0,0,0.12)] max-[900px]:right-auto max-[900px]:left-0 max-[900px]:origin-bottom-left"
                      role="tooltip"
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.22, ease: EASE_OUT }}
                    >
                      <img
                        src={qr}
                        alt={label}
                        className="size-32 rounded-landing-sm object-contain"
                      />
                      <span className="text-ink-secondary text-[13px] leading-5">{label}</span>
                      <span
                        className="absolute right-3.5 bottom-[-5px] size-[9px] rotate-45 border-r border-b border-line-subtle bg-white max-[900px]:right-auto max-[900px]:left-3.5"
                        aria-hidden="true"
                      />
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
