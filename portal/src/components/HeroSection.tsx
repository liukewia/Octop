import { useState, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowRight, Github, Globe, MousePointer2 } from "lucide-react";
import heroBgMp4 from "@/assets/landing/hero-bg.mp4";
import heroBgWebp from "@/assets/landing/hero-bg.webp";
import heroChat from "@/assets/landing/hero-chat.webp";
import octopMascotType from "@/assets/landing/octop-mascot-type.webp";
import { DOCS_URL, GITHUB_URL } from "@/constants/links";
import { cn } from "@/lib/utils";
import { EASE_OUT, hoverArrow, hoverLift, rise, staggerOnMount } from "@/motion";

const CONNECTIVITY_CARDS = [
  {
    iconSize: 27,
    card: "left-[26px] top-0 w-[211px] gap-[18px] rounded-[13px] p-[9px] opacity-40 [filter:drop-shadow(0_4px_18px_rgba(0,0,0,0.06))]",
    icon: "size-[42px] rounded-[9px]",
    text: "text-[9px] leading-[18px]",
  },
  {
    iconSize: 29,
    card: "top-[11px] left-[15px] w-[233px] gap-5 rounded-[15px] p-2.5 opacity-80 [filter:drop-shadow(0_5px_20px_rgba(0,0,0,0.06))]",
    icon: "size-[47px] rounded-[10px]",
    text: "text-[10px] leading-5",
  },
  {
    iconSize: 33,
    card: "top-[22px] left-0 w-[264px] gap-2 rounded-[17px] p-[11px] [filter:drop-shadow(0_6px_22px_rgba(255,0,0,0.08))]",
    icon: "size-[53px] rounded-[11px]",
    text: "text-[17px] leading-7 font-semibold",
  },
] as const;

const FLOAT_IN = { duration: 0.8, delay: 0.7, ease: EASE_OUT };

export function HeroSection() {
  const { t } = useTranslation();
  const heroRef = useRef<HTMLElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const connectivityY = useTransform(scrollYProgress, [0, 1], [0, -110]);
  const metricsY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const scriptY = useTransform(scrollYProgress, [0, 1], [0, -70]);

  return (
    <section
      className="relative overflow-hidden pt-[170px] max-[900px]:pt-[120px]"
      id="overview"
      ref={heroRef}
    >
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <img
          src={heroBgWebp}
          alt=""
          className="block size-full object-cover object-top"
        />
        <motion.video
          className="absolute inset-0 block size-full object-cover object-top pointer-events-none"
          src={heroBgMp4}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: videoReady ? 1 : 0 }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
          onCanPlay={() => setVideoReady(true)}
        />
        <div className="absolute inset-x-0 bottom-0 h-[220px] bg-linear-to-b from-white/0 to-white to-[78%]" />
      </div>

      <motion.div
        className="page-container relative z-[1] flex flex-col items-center text-center"
        {...staggerOnMount(0.09, 0.1)}
      >
        <motion.a
          className="inline-flex h-9 items-center gap-2 rounded-[30px] border border-line-subtle bg-[#fff5f4] px-[15px] text-sm leading-[22px] text-[#0d0d0d] no-underline"
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          variants={rise}
          whileHover={{ y: -2 }}
        >
          <Github size={16} className="size-4" />
          <span>
            {t("hero.badge_prefix")}
            <strong className="font-semibold text-black">{t("hero.badge_stars")}</strong>
            {t("hero.badge_suffix")}
          </span>
        </motion.a>

        <motion.h1
          className="text-ink mt-3.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[52px] leading-[60px] font-semibold max-[900px]:text-[36px] max-[900px]:leading-[46px] max-[600px]:text-[28px] max-[600px]:leading-[38px]"
          variants={rise}
        >
          <span>{t("hero.title_lead")}</span>
          <img
            src={octopMascotType}
            alt=""
            className="size-[132px] object-contain object-bottom max-[900px]:size-[92px]"
          />
          <span>{t("hero.title_trail")}</span>
        </motion.h1>

        <motion.p
          className="text-ink-muted mt-5 max-w-[1020px] text-xl leading-7 max-[600px]:text-base max-[600px]:leading-6"
          variants={rise}
        >
          {t("hero.subtitle")}
        </motion.p>

        <motion.div className="mt-12 flex items-center gap-4" variants={rise}>
          <motion.a
            className="inline-flex h-[50px] items-center gap-2 rounded-landing-md bg-black px-9 text-lg leading-[26px] font-medium whitespace-nowrap text-white no-underline transition-opacity duration-200 ease-out hover:opacity-[0.88] max-[600px]:h-11 max-[600px]:px-6 max-[600px]:text-base"
            href="#install"
            {...hoverLift}
          >
            {t("hero.cta_primary")}
            <motion.span className="inline-flex" variants={hoverArrow}>
              <ArrowRight size={20} />
            </motion.span>
          </motion.a>
          <motion.a
            className="text-ink-secondary inline-flex h-[50px] items-center gap-2 rounded-landing-sm border border-line-subtle bg-white px-9 text-lg leading-[26px] font-medium whitespace-nowrap no-underline transition-colors duration-200 ease-out hover:bg-surface-subtle max-[600px]:h-11 max-[600px]:px-6 max-[600px]:text-base"
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            {...hoverLift}
          >
            {t("hero.cta_secondary")}
          </motion.a>
        </motion.div>

        <motion.div
          className="relative mx-auto mt-[100px] w-[min(1148px,100%)] perspective-[1400px] max-[900px]:mt-14"
          variants={rise}
        >
          <motion.img
            src={heroChat}
            alt={t("hero.screenshot_alt")}
            className="block h-auto w-full rounded-landing-card"
            initial={{ opacity: 0, scale: 0.97, rotateX: 8 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            transition={{ duration: 1.1, delay: 0.45, ease: EASE_OUT }}
          />

          <motion.div
            className="absolute top-[259px] left-[-136px] h-[97px] w-[264px] max-[1280px]:hidden"
            aria-hidden="true"
            style={{ y: connectivityY }}
            initial={{ opacity: 0, x: -32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={FLOAT_IN}
          >
            {CONNECTIVITY_CARDS.map((card, index) => (
              <div
                key={card.iconSize}
                className={cn("absolute flex items-center bg-white", card.card)}
              >
                <span
                  className={cn(
                    "bg-brand-soft text-brand-strong flex shrink-0 items-center justify-center",
                    card.icon,
                  )}
                >
                  <Globe size={card.iconSize} strokeWidth={1.6} />
                </span>
                <div
                  className={cn(
                    "flex flex-col items-start text-left font-semibold break-words",
                    card.text,
                  )}
                >
                  <p className="text-ink">Connectivity Test</p>
                  {index < 2 ? <p className="text-ink-ghost">Routing Connectivity Tests</p> : null}
                </div>
              </div>
            ))}
          </motion.div>

          <motion.div
            className="absolute top-[-29px] left-[958px] h-[107px] w-[274px] max-[1280px]:hidden"
            aria-hidden="true"
            style={{ y: metricsY }}
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={FLOAT_IN}
          >
            <div className="absolute top-0 left-0 flex h-[68px] w-[190px] flex-col gap-[5px] rounded-2xl bg-white px-[22px] py-4 opacity-60 [filter:drop-shadow(0_6px_24px_rgba(0,0,0,0.06))]">
              <div className="text-ink flex items-start justify-between text-sm leading-[25px] font-medium whitespace-nowrap">
                <span>Disk</span>
                <span>20%</span>
              </div>
              <div className="bg-brand-tint relative h-[3px] rounded-[64px]">
                <motion.div
                  className="bg-brand-strong absolute top-0 left-0 h-[3px] rounded-[64px]"
                  initial={{ width: 0 }}
                  animate={{ width: "24%" }}
                  transition={{ duration: 1.2, delay: 1.1, ease: EASE_OUT }}
                />
              </div>
            </div>
            <div className="absolute top-9 left-[42px] flex h-[68px] w-[232px] flex-col gap-[5px] rounded-2xl bg-white px-[22px] py-4 opacity-100 [filter:drop-shadow(0_6px_24px_rgba(255,0,0,0.08))]">
              <div className="text-ink flex items-start justify-between text-sm leading-[25px] font-medium whitespace-nowrap">
                <span>Memory</span>
                <span>48%</span>
              </div>
              <div className="bg-brand-tint relative h-[3px] rounded-[64px]">
                <motion.div
                  className="bg-brand-strong absolute top-0 left-0 h-[3px] rounded-[64px]"
                  initial={{ width: 0 }}
                  animate={{ width: "41%" }}
                  transition={{ duration: 1.2, delay: 1.25, ease: EASE_OUT }}
                />
              </div>
            </div>
            <MousePointer2
              size={34}
              className="fill-brand-strong absolute top-[86px] left-[214px] text-white"
            />
          </motion.div>

          <motion.div
            className="absolute top-[348px] left-[1052px] w-[257px] rounded-[10px] bg-white pb-3 text-left shadow-[0_5px_19px_rgba(255,0,0,0.08)] max-[1280px]:hidden"
            aria-hidden="true"
            style={{ y: scriptY }}
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...FLOAT_IN, delay: 0.82 }}
          >
            <div className="flex h-8 items-center justify-end border-b border-line-subtle px-[19px]">
              <span className="bg-brand-tint text-brand-strong inline-flex h-3.5 w-9 items-center justify-center rounded-[36px] font-mono text-[8px]">
                .sh
              </span>
            </div>
            <pre className="mt-2.5 mb-0 px-[19px] font-mono text-xs leading-[21px] text-[#92969d]">
              <span className="text-[#565c65]">#!/bin/bash</span>
              {"\n"}check_disk &amp;&amp; check_cpu{"\n"}report_status --json
            </pre>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
