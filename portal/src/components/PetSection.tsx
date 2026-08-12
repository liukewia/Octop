import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ChevronDown, Download, Monitor } from "lucide-react";
import appleIcon from "@/assets/landing/apple.svg";
import featureDesktopPet from "@/assets/landing/feature-desktop-pet.png";
import octopusPet from "@/assets/landing/octopus-pet.webp";
import underlineInstall from "@/assets/landing/underline-install.svg";
import { OCTOP_PET_RELEASES_URL } from "@/constants/links";
import { cn } from "@/lib/utils";
import { EASE_OUT, fadeUp, hoverLift, popIn, rise, staggerParent } from "@/motion";

type PetPlatform = "mac_arm" | "mac_intel" | "win_x64" | "win_arm";

type PlatformSpec = {
  id: PetPlatform;
  icon: "apple" | "windows";
  ext: string;
  url: string;
};

const PET_VERSION = "0.1.0";
const DOWNLOAD_BASE = `${OCTOP_PET_RELEASES_URL}/download/v${PET_VERSION}`;

const assetUrl = (suffix: string) => `${DOWNLOAD_BASE}/OctopPet_${PET_VERSION}_${suffix}`;

const PLATFORMS: PlatformSpec[] = [
  {
    id: "mac_arm",
    icon: "apple",
    ext: ".dmg",
    url: assetUrl("aarch64.dmg"),
  },
  {
    id: "mac_intel",
    icon: "apple",
    ext: ".dmg",
    url: assetUrl("x64.dmg"),
  },
  {
    id: "win_x64",
    icon: "windows",
    ext: ".exe",
    url: assetUrl("x64-setup.exe"),
  },
  {
    id: "win_arm",
    icon: "windows",
    ext: ".exe",
    url: assetUrl("arm64-setup.exe"),
  },
];

/** Best-effort OS + architecture guess; `null` keeps the button generic (e.g. on Linux). */
function detectPlatform(): PetPlatform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes("windows")) {
    return ua.includes("arm64") || ua.includes("aarch64") ? "win_arm" : "win_x64";
  }

  if (ua.includes("mac")) {
    // Apple Silicon browsers still report "MacIntel", so fall back to the arm build,
    // which covers every Mac sold since 2020.
    const arch = (
      navigator as Navigator & { userAgentData?: { architecture?: string } }
    ).userAgentData?.architecture?.toLowerCase();
    return arch?.includes("x86") ? "mac_intel" : "mac_arm";
  }

  return null;
}

export function PetSection() {
  const { t } = useTranslation();
  const [detected, setDetected] = useState<PetPlatform | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDetected(detectPlatform());
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const primary = PLATFORMS.find((platform) => platform.id === detected);
  const primaryUrl = primary?.url ?? OCTOP_PET_RELEASES_URL;
  const primaryLabel = primary
    ? t("pet.download_for", { platform: t(`pet.platforms.${primary.id}.label`) })
    : t("pet.download");

  return (
    <section className="pt-[200px] max-[900px]:pt-24" id="pet">
      <div className="page-container grid grid-cols-[465px_minmax(0,859px)] justify-between gap-[60px] max-[1280px]:grid-cols-[minmax(0,1fr)] max-[1280px]:gap-10">
        <motion.div className="relative pb-[280px] max-[1280px]:pb-0" {...staggerParent(0.12)}>
          <motion.h2
            className="relative inline-block text-[42px] leading-[50px] font-semibold text-black max-[600px]:text-[32px] max-[600px]:leading-10"
            variants={rise}
          >
            {t("pet.title")}
            <img
              src={underlineInstall}
              alt=""
              className="pointer-events-none absolute top-10 left-0 h-3.5 w-[170px] select-none"
            />
          </motion.h2>
          <motion.p
            className="text-ink-muted mt-8 text-xl leading-7 max-[600px]:text-base max-[600px]:leading-6"
            variants={rise}
          >
            {t("pet.desc")}
          </motion.p>
          <motion.img
            src={octopusPet}
            alt=""
            className="absolute left-[-12px] h-auto w-[260px] max-[1280px]:static max-[1280px]:mt-6 max-[1280px]:block max-[1280px]:w-[180px]"
            loading="lazy"
            variants={popIn}
          />
        </motion.div>

        <motion.div className="flex min-w-0 flex-col gap-6" {...fadeUp(0.1, 36)}>
          <motion.img
            src={featureDesktopPet}
            alt={t("pet.title")}
            className="block h-auto w-full rounded-landing-md border border-line-subtle bg-surface-subtle"
            loading="lazy"
            initial={{ opacity: 0, scale: 1.04 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.9, ease: EASE_OUT }}
          />

          <div className="flex flex-wrap items-center gap-3">
            <motion.a
              className="inline-flex h-[50px] items-center gap-2 rounded-landing-md bg-black px-8 text-base leading-6 font-medium text-white no-underline max-[600px]:h-11 max-[600px]:px-5 max-[600px]:text-sm"
              href={primaryUrl}
              {...hoverLift}
            >
              <Download size={18} />
              {primaryLabel}
            </motion.a>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className="border-line-strong text-ink-secondary hover:text-ink inline-flex h-[50px] cursor-pointer items-center gap-2 rounded-landing-md border bg-white px-6 text-base leading-6 font-medium transition-colors duration-200 ease-out hover:bg-surface-subtle max-[600px]:h-11 max-[600px]:px-4 max-[600px]:text-sm"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                {t("pet.all_platforms")}
                <ChevronDown
                  size={16}
                  className={cn("transition-transform duration-200", menuOpen && "rotate-180")}
                />
              </button>

              <AnimatePresence>
                {menuOpen ? (
                  <motion.div
                    role="menu"
                    className="border-line-subtle absolute top-full left-0 z-20 mt-2 w-[400px] overflow-hidden rounded-landing-md border bg-white shadow-[0_12px_32px_rgba(0,0,0,0.12)] max-[600px]:w-[min(320px,calc(100vw-40px))]"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                  >
                    {PLATFORMS.map((platform) => (
                      <a
                        key={platform.id}
                        role="menuitem"
                        href={platform.url}
                        className="hover:bg-surface-subtle flex items-center gap-3 px-4 py-3 no-underline transition-colors duration-200 ease-out"
                      >
                        <span
                          className="text-ink flex size-8 shrink-0 items-center justify-center rounded-landing-sm bg-[#f2f2f2]"
                          aria-hidden="true"
                        >
                          {platform.icon === "apple" ? (
                            <img src={appleIcon} alt="" className="size-4" />
                          ) : (
                            <Monitor size={16} />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-ink text-sm leading-[22px] font-medium">
                            {t(`pet.platforms.${platform.id}.label`)}
                          </p>
                          <p className="text-ink-faint text-xs leading-[18px]">
                            {t(`pet.platforms.${platform.id}.meta`)}
                          </p>
                        </div>
                        <span className="text-ink-faint shrink-0 text-xs leading-[18px]">
                          {platform.ext}
                        </span>
                      </a>
                    ))}

                    <a
                      className="border-line-subtle text-ink-secondary hover:text-ink block border-t px-4 py-3 text-xs leading-[18px] no-underline transition-colors duration-200 ease-out"
                      href={OCTOP_PET_RELEASES_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("pet.all_releases")}
                    </a>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
