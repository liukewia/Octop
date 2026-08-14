import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "@/hooks";
import { cn } from "@/lib/utils";
import { EASE_OUT, VIEWPORT_TALL, rise, staggerParent, zoomOut } from "@/motion";
import featureAcp from "@/assets/landing/feature-acp.png";
import featureCardBg1 from "@/assets/landing/feature-card-bg-1.png";
import featureCardBg2 from "@/assets/landing/feature-card-bg-2.png";
import featureCardBg3 from "@/assets/landing/feature-card-bg-3.png";
import featureCardBg4 from "@/assets/landing/feature-card-bg-4.png";
import featureCardBg5 from "@/assets/landing/feature-card-bg-5.png";
import featureConnectors from "@/assets/landing/feature-connectors.png";
import featureDesktopPet from "@/assets/landing/feature-desktop-pet.png";
import featureExperts from "@/assets/landing/feature-experts.png";
import featureRemoteDesktop from "@/assets/landing/feature-remote-desktop.png";
import underlineWhy from "@/assets/landing/underline-why.svg";

const BLOCKS = [
  { id: "multi_user", image: featureExperts, bg: featureCardBg1 },
  { id: "connectors", image: featureConnectors, bg: featureCardBg2 },
  { id: "coding", image: featureAcp, bg: featureCardBg3 },
  { id: "computer", image: featureRemoteDesktop, bg: featureCardBg4 },
  { id: "desktop_pet", image: featureDesktopPet, bg: featureCardBg5 },
] as const;

/** Narrow layout only: cards pin below the navbar and pile up, each one peeking out a bit further. */
const STACK_QUERY = "(max-width: 900px)";
const STACK_TOP = 88;
const STACK_STEP = 10;
/** Width step per stack level: the card in front is always one step wider than the one behind. */
const STACK_SCALE_STEP = 0.025;

function FeatureBlock({
  block,
  index,
  stacked,
  stackProgress,
  onMount,
}: {
  block: (typeof BLOCKS)[number];
  index: number;
  stacked: boolean;
  stackProgress: MotionValue<number>;
  onMount: (id: string, node: HTMLElement | null) => void;
}) {
  const { t } = useTranslation();
  // How many cards will end up pinned on top of this one — the deeper it sits, the narrower it
  // settles, so the pinned stack reads as a deck instead of one flat card.
  const depth = BLOCKS.length - 1 - index;
  // A sticky card never moves, so its own scroll offsets stay frozen — progress has to come
  // from the (non-sticky) stack container, split into one window per card. The frontmost card
  // is never covered, hence the 0 output.
  const covered = useTransform(
    stackProgress,
    [index / BLOCKS.length, (index + 1) / BLOCKS.length],
    [0, depth === 0 ? 0 : 1],
  );
  const scale = useTransform(covered, [0, 1], [1, 1 - depth * STACK_SCALE_STEP]);
  // Dim with an opaque veil rather than card opacity, which would let the card below show through.
  const veil = useTransform(covered, [0, 1], [0, 0.62]);

  return (
    <motion.article
      className={cn(
        "scroll-mt-[120px]",
        stacked &&
          "border-line-subtle relative overflow-hidden rounded-landing-card border bg-white p-5 shadow-[0_-6px_28px_rgba(0,0,0,0.08)]",
      )}
      data-block-id={block.id}
      ref={(node: HTMLElement | null) => onMount(block.id, node)}
      style={
        stacked
          ? {
              position: "sticky",
              top: STACK_TOP + index * STACK_STEP,
              zIndex: index + 1,
              transformOrigin: "top center",
              scale,
            }
          : undefined
      }
      {...staggerParent(0.14, 0, VIEWPORT_TALL)}
    >
      {stacked ? (
        <motion.span
          className="pointer-events-none absolute inset-0 z-[1] bg-white"
          style={{ opacity: veil }}
          aria-hidden="true"
        />
      ) : null}

      <motion.header className="flex max-w-[593px] flex-col gap-4" variants={rise}>
        <h3 className="text-xl leading-7 font-medium text-black">
          {t(`why.items.${block.id}.title`)}
        </h3>
        <p className="text-ink-faint text-base leading-6 max-[600px]:text-sm max-[600px]:leading-[22px]">
          {t(`why.items.${block.id}.desc`)}
        </p>
      </motion.header>

      <motion.div
        className="relative mt-[43px] aspect-[841/593] overflow-hidden rounded-landing-card bg-[linear-gradient(146deg,rgb(255,222,222)_2.4%,rgb(241,240,224)_79.8%,rgb(255,242,221)_97.7%)] max-[900px]:mt-5"
        variants={rise}
      >
        <div className="absolute inset-0" aria-hidden="true">
          <img src={block.bg} alt="" className="size-full object-cover" />
          <span className="absolute inset-0 bg-brand mix-blend-soft-light" />
        </div>

        <motion.img
          src={block.image}
          alt={t(`why.items.${block.id}.title`)}
          className="absolute top-[50px] left-[50px] h-auto w-[calc(100%+161px)] max-w-none rounded-landing-md shadow-[0_24px_50px_rgba(221,0,0,0.32)] max-[900px]:top-6 max-[900px]:left-6 max-[900px]:w-[calc(100%+80px)]"
          loading="lazy"
          variants={zoomOut}
        />
      </motion.div>
    </motion.article>
  );
}

export function WhySection() {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string>(BLOCKS[0].id);
  const blockRefs = useRef(new Map<string, HTMLElement>());
  const stacked = useMediaQuery(STACK_QUERY);
  const stackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: stackProgress } = useScroll({
    target: stackRef,
    offset: [`start ${STACK_TOP}px`, "end end"],
  });

  const registerBlock = (id: string, node: HTMLElement | null) => {
    if (node) blockRefs.current.set(id, node);
    else blockRefs.current.delete(id);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target instanceof HTMLElement && visible.target.dataset.blockId) {
          setActiveId(visible.target.dataset.blockId);
        }
      },
      { rootMargin: "-30% 0px -55% 0px" },
    );

    blockRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const scrollToBlock = (id: string) => {
    blockRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="pt-[240px] max-[900px]:pt-[120px]" id="why">
      <div className="page-container grid grid-cols-[465px_minmax(0,841px)] justify-between gap-[60px] max-[1280px]:grid-cols-[minmax(0,1fr)] max-[1280px]:gap-12">
        <aside>
          <motion.div className="sticky top-[120px] max-[1280px]:static" {...staggerParent(0.12)}>
            <motion.h2
              className="inline-block text-[36px] leading-[44px] font-semibold text-black max-[600px]:text-[28px] max-[600px]:leading-9"
              variants={rise}
            >
              {t("why.title_lead")}{" "}
              <span className="relative z-0 inline-block whitespace-nowrap">
                Octop
                <img
                  src={underlineWhy}
                  alt=""
                  className="pointer-events-none absolute top-[calc(100%-10px)] left-0 -z-10 h-3.5 w-full select-none"
                />
              </span>
            </motion.h2>

            <motion.nav
              className="mt-[76px] flex flex-col items-start gap-9 border-l-[3px] border-transparent pl-5 max-[1280px]:hidden"
              variants={rise}
            >
              {BLOCKS.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  className={cn(
                    "text-ink-faint hover:text-ink-secondary relative max-w-[220px] cursor-pointer border-none bg-transparent p-0 text-left font-[inherit] text-[17px] leading-[26px] transition-colors duration-200 ease-out",
                    activeId === block.id && "font-medium text-black",
                  )}
                  onClick={() => scrollToBlock(block.id)}
                >
                  {activeId === block.id ? (
                    <motion.span
                      layoutId="whyNavMarker"
                      className="absolute inset-y-0 left-[-23px] w-[3px] rounded-[3px] bg-black"
                      transition={{ duration: 0.4, ease: EASE_OUT }}
                    />
                  ) : null}
                  {t(`why.items.${block.id}.title`)}
                </button>
              ))}
            </motion.nav>
          </motion.div>
        </aside>

        <div
          className="flex flex-col gap-[120px] max-[900px]:gap-5 max-[900px]:pb-[10vh]"
          ref={stackRef}
        >
          {BLOCKS.map((block, index) => (
            <FeatureBlock
              key={block.id}
              block={block}
              index={index}
              stacked={stacked}
              stackProgress={stackProgress}
              onMount={registerBlock}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
