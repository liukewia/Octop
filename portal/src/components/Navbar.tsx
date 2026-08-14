import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { changeLocale } from "@/i18n";
import { cn } from "@/lib/utils";
import { readStoredUiLocale, type UiLocale } from "@/utils/localePrefs";
import logoName from "@/assets/landing/logo_name.png";
import { CHANGELOG_URL, docsUrl } from "@/constants/links";
import { EASE_OUT } from "@/motion";

export function Navbar() {
  const { t, i18n } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const navLinks = [
    { key: "overview", href: "#overview" },
    { key: "changelog", href: CHANGELOG_URL },
    { key: "docs", href: docsUrl(i18n.resolvedLanguage ?? i18n.language) },
  ] as const;

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
      className={cn(
        "fixed inset-x-0 top-0 z-[100] border-b border-transparent transition-[background,backdrop-filter,border-color] duration-300 ease-out",
        scrolled && "border-line-subtle bg-white/82 backdrop-blur-[16px]",
      )}
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
    >
      <div className="relative flex h-16 items-center justify-between gap-6 px-20 max-[1280px]:px-10 max-[600px]:px-5">
        <motion.a
          href={import.meta.env.BASE_URL}
          className="flex shrink-0 items-center gap-2 no-underline"
          aria-label="Octop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <img src={logoName} alt="Octop" className="h-9 w-auto object-contain" />
        </motion.a>

        <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-8 max-[900px]:hidden">
          {navLinks.map((link, index) => (
            <motion.a
              key={link.key}
              className="text-ink-secondary text-sm leading-[22px] font-medium no-underline transition-colors duration-200 ease-out hover:text-ink"
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
          className="flex items-center gap-3"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: EASE_OUT }}
        >
          <button
            type="button"
            className="text-ink-secondary hover:text-ink inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent px-1 py-[7px] font-[inherit] text-sm leading-[22px] font-medium transition-colors duration-200 ease-out"
            onClick={handleToggleLang}
          >
            <Languages size={16} strokeWidth={1.8} />
            {t("nav.lang")}
          </button>
        </motion.div>
      </div>
    </motion.nav>
  );
}
