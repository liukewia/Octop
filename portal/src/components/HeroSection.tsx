import { useLayoutEffect, useState, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowRight, Bot, Check, Github, MousePointer2, ShieldCheck, Terminal } from "lucide-react";
import heroBgMp4 from "@/assets/landing/hero-bg.mp4";
import heroBgWebp from "@/assets/landing/hero-bg.webp";
import heroChat from "@/assets/landing/hero-chat.png";
import heroChatEn from "@/assets/landing/hero-chat-en.png";
import octopMascotType from "@/assets/landing/octop-mascot-type.webp";
import { docsUrl, GITHUB_URL } from "@/constants/links";
import { cn } from "@/lib/utils";
import { EASE_OUT, hoverArrow, hoverLift, rise, staggerOnMount } from "@/motion";
import { pickLocalizedAsset } from "@/utils/localePrefs";

/** Real experts from Octop's bundled catalog; the first one matches the agent in the screenshot. */
const ASSISTANTS = ["ops", "news", "parenting"] as const;

const COMPUTER_STEPS = ["terminal", "browser", "shot"] as const;

const FLOAT_IN = { duration: 0.8, delay: 0.7, ease: EASE_OUT };

/** Design width the floating cards are positioned against; they scale down with the screenshot. */
const FLOAT_FRAME_WIDTH = 1148;

function AssistantsCard() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 rounded-[16px] bg-white p-3.5 text-left [filter:drop-shadow(0_6px_22px_rgba(255,0,0,0.08))]">
      <p className="text-ink-ghost text-[11px] leading-4 font-medium">
        {t("hero.float.assistants_title")}
      </p>
      <div className="flex flex-col gap-1.5">
        {ASSISTANTS.map((id, index) => {
          const active = index === 0;
          return (
            <div
              key={id}
              className={cn(
                "flex items-center gap-2.5 rounded-[10px] px-2 py-1.5",
                active && "bg-brand-soft",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-[8px]",
                  active ? "bg-brand-strong text-white" : "text-ink-secondary bg-[#f2f2f2]",
                )}
              >
                <Bot size={16} strokeWidth={1.8} />
              </span>
              <span
                className={cn(
                  "flex-1 truncate text-[12px] leading-4 font-medium",
                  active ? "text-ink" : "text-ink-secondary",
                )}
              >
                {t(`hero.float.assistant_${id}`)}
              </span>
              {active ? <Check size={14} className="text-brand-strong shrink-0" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComputerCard() {
  const { t } = useTranslation();

  return (
    <div className="relative rounded-[16px] bg-white text-left [filter:drop-shadow(0_6px_24px_rgba(255,0,0,0.08))]">
      <div className="border-line-subtle flex items-center gap-2 border-b px-3.5 py-2.5">
        <span className="bg-brand-soft text-brand-strong flex size-6 items-center justify-center rounded-[7px]">
          <Terminal size={13} strokeWidth={2} />
        </span>
        <span className="text-ink text-[12px] leading-4 font-semibold">
          {t("hero.float.computer_title")}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 py-3">
        {COMPUTER_STEPS.map((id) => (
          <div key={id} className="flex items-center gap-2">
            <span className="bg-brand-strong flex size-3.5 shrink-0 items-center justify-center rounded-full text-white">
              <Check size={9} strokeWidth={3} />
            </span>
            <span className="text-ink-secondary text-[11px] leading-4">
              {t(`hero.float.computer_step_${id}`)}
            </span>
          </div>
        ))}
      </div>
      <MousePointer2
        size={34}
        className="fill-brand-strong absolute -right-2 -bottom-3 text-white"
      />
    </div>
  );
}

function LocalCard() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 rounded-[16px] bg-white p-3.5 text-left shadow-[0_5px_19px_rgba(255,0,0,0.08)]">
      <div className="flex items-center gap-2.5">
        <span className="bg-brand-soft text-brand-strong flex size-8 shrink-0 items-center justify-center rounded-[9px]">
          <ShieldCheck size={18} strokeWidth={1.8} />
        </span>
        <span className="text-ink text-[13px] leading-[18px] font-semibold">
          {t("hero.float.local_title")}
        </span>
      </div>
      <p className="text-ink-secondary text-[11px] leading-4">{t("hero.float.local_desc")}</p>
      <span className="bg-brand-tint text-brand-strong w-fit rounded-[6px] px-2 py-0.5 text-[10px] leading-4 font-medium">
        {t("hero.float.local_badge")}
      </span>
    </div>
  );
}

export function HeroSection() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const heroChatSrc = pickLocalizedAsset(heroChat, heroChatEn, locale);
  const heroDocsUrl = docsUrl(locale);
  const heroRef = useRef<HTMLElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const assistantsY = useTransform(scrollYProgress, [0, 1], [0, -110]);
  const computerY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const localY = useTransform(scrollYProgress, [0, 1], [0, -70]);

  const frameRef = useRef<HTMLDivElement>(null);
  const [floatScale, setFloatScale] = useState(1);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // Measure synchronously first so the cards never paint at the unscaled size.
    const measure = () =>
      setFloatScale(Math.min(1, frame.getBoundingClientRect().width / FLOAT_FRAME_WIDTH));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="relative overflow-hidden pt-[170px] max-[900px]:pt-[120px]"
      id="overview"
      ref={heroRef}
    >
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <img src={heroBgWebp} alt="" className="block size-full object-cover object-top" />
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
          className="text-ink mt-3.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[48px] leading-[56px] font-semibold max-[900px]:text-[36px] max-[900px]:leading-[46px] max-[600px]:text-[28px] max-[600px]:leading-[38px]"
          variants={rise}
        >
          <span>{t("hero.title_lead")}</span>
          <img
            src={octopMascotType}
            alt=""
            className="size-[80px] object-contain object-bottom max-[900px]:size-[92px]"
          />
          <span>{t("hero.title_trail")}</span>
        </motion.h1>

        <motion.p
          className="text-ink-muted mt-1 max-w-[1020px] text-base leading-6"
          variants={rise}
        >
          {t("hero.subtitle")}
        </motion.p>

        <motion.div
          className="mt-12 flex items-center gap-4 max-[900px]:mt-9 max-[600px]:gap-3"
          variants={rise}
        >
          <motion.a
            className="inline-flex h-[50px] items-center gap-2 rounded-landing-md bg-black px-9 text-lg leading-[26px] font-medium whitespace-nowrap text-white no-underline transition-opacity duration-200 ease-out hover:opacity-[0.88] max-[900px]:h-12 max-[900px]:gap-1.5 max-[900px]:px-7 max-[900px]:text-base max-[600px]:h-10 max-[600px]:px-5 max-[600px]:text-sm"
            href="#install"
            {...hoverLift}
          >
            {t("hero.cta_primary")}
            <motion.span className="inline-flex" variants={hoverArrow}>
              <ArrowRight className="size-5 max-[900px]:size-[18px] max-[600px]:size-4" />
            </motion.span>
          </motion.a>
          <motion.a
            className="text-ink-secondary inline-flex h-[50px] items-center gap-2 rounded-landing-sm border border-line-subtle bg-white px-9 text-lg leading-[26px] font-medium whitespace-nowrap no-underline transition-colors duration-200 ease-out hover:bg-surface-subtle max-[900px]:h-12 max-[900px]:px-7 max-[900px]:text-base max-[600px]:h-10 max-[600px]:px-5 max-[600px]:text-sm"
            href={heroDocsUrl}
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
          ref={frameRef}
        >
          <motion.img
            src={heroChatSrc}
            alt={t("hero.screenshot_alt")}
            className="block h-auto w-full rounded-t-landing-card"
            initial={{ opacity: 0, scale: 0.97, rotateX: 8 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            transition={{ duration: 1.1, delay: 0.45, ease: EASE_OUT }}
          />

          <div
            className="pointer-events-none absolute top-0 left-0 h-0 w-[1148px] origin-top-left max-[768px]:hidden"
            style={{ transform: `scale(${floatScale})` }}
            aria-hidden="true"
          >
            <motion.div
              className="absolute top-[236px] left-0 w-[248px] min-[1281px]:left-[-24px]"
              style={{ y: assistantsY }}
              initial={{ opacity: 0, x: -32 }}
              animate={{ opacity: 1, x: 0 }}
              transition={FLOAT_IN}
            >
              <AssistantsCard />
            </motion.div>

            <motion.div
              className="absolute top-[-40px] left-[854px] w-[286px] min-[1281px]:left-[878px]"
              style={{ y: computerY }}
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              transition={FLOAT_IN}
            >
              <ComputerCard />
            </motion.div>

            <motion.div
              className="absolute top-[360px] left-[912px] w-[236px] min-[1281px]:left-[936px]"
              style={{ y: localY }}
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...FLOAT_IN, delay: 0.82 }}
            >
              <LocalCard />
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
