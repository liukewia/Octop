import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
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

export function WhySection() {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string>(BLOCKS[0].id);
  const blockRefs = useRef(new Map<string, HTMLElement>());

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
          <motion.div
            className="sticky top-[120px] max-[1280px]:static"
            {...staggerParent(0.12)}
          >
            <motion.h2
              className="inline-block text-[42px] leading-[50px] font-semibold text-black max-[600px]:text-[32px] max-[600px]:leading-10"
              variants={rise}
            >
              {t("why.title_lead")}{" "}
              <span className="relative inline-block whitespace-nowrap">
                Octop
                <img
                  src={underlineWhy}
                  alt=""
                  className="pointer-events-none absolute top-[calc(100%-10px)] left-0 h-3.5 w-full select-none"
                />
              </span>
            </motion.h2>
            <motion.p
              className="text-ink-faint mt-7 text-xl leading-7 max-[600px]:text-base max-[600px]:leading-6"
              variants={rise}
            >
              {t("why.desc")}
            </motion.p>

            <motion.nav
              className="mt-[76px] flex flex-col items-start gap-9 border-l-[3px] border-transparent pl-5 max-[1280px]:hidden"
              variants={rise}
            >
              {BLOCKS.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  className={cn(
                    "text-ink-faint hover:text-ink-secondary relative max-w-[220px] cursor-pointer border-none bg-transparent p-0 text-left font-[inherit] text-xl leading-7 transition-colors duration-200 ease-out",
                    activeId === block.id && "font-medium text-black",
                  )}
                  onClick={() => scrollToBlock(block.id)}
                >
                  {activeId === block.id ? (
                    <motion.span
                      layoutId="whyNavMarker"
                      className="absolute top-0 left-[-23px] h-7 w-[3px] rounded-[3px] bg-black"
                      transition={{ duration: 0.4, ease: EASE_OUT }}
                    />
                  ) : null}
                  {t(`why.items.${block.id}.title`)}
                </button>
              ))}
            </motion.nav>
          </motion.div>
        </aside>

        <div className="flex flex-col gap-[120px] max-[900px]:gap-[72px]">
          {BLOCKS.map((block) => (
            <motion.article
              key={block.id}
              className="scroll-mt-[120px]"
              data-block-id={block.id}
              ref={(node: HTMLElement | null) => {
                if (node) blockRefs.current.set(block.id, node);
                else blockRefs.current.delete(block.id);
              }}
              {...staggerParent(0.14, 0, VIEWPORT_TALL)}
            >
              <motion.header className="flex max-w-[593px] flex-col gap-4" variants={rise}>
                <h3 className="text-2xl leading-8 font-medium text-black">
                  {t(`why.items.${block.id}.title`)}
                </h3>
                <p className="text-ink-faint text-lg leading-[26px] max-[600px]:text-[15px] max-[600px]:leading-6">
                  {t(`why.items.${block.id}.desc`)}
                </p>
              </motion.header>

              <motion.div
                className="relative mt-[43px] aspect-[841/593] overflow-hidden rounded-landing-card bg-[linear-gradient(146deg,rgb(255,222,222)_2.4%,rgb(241,240,224)_79.8%,rgb(255,242,221)_97.7%)]"
                variants={rise}
              >
                <div className="absolute inset-0" aria-hidden="true">
                  <img src={block.bg} alt="" className="size-full object-cover" />
                  <span className="absolute inset-0 bg-brand mix-blend-soft-light" />
                  <span className="absolute inset-0 bg-linear-to-b from-white from-[8.5%] to-white/0" />
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
          ))}
        </div>
      </div>
    </section>
  );
}
