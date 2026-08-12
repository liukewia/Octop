import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
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
import styles from "./WhySection.module.less";

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
    <section className={styles.section} id="why">
      <div className={styles.inner}>
        <aside className={styles.aside}>
          <motion.div className={styles.asideSticky} {...staggerParent(0.12)}>
            <motion.h2 className={styles.heading} variants={rise}>
              {t("why.title_lead")}{" "}
              <span className={styles.brand}>
                Octop
                <img src={underlineWhy} alt="" className={styles.underline} />
              </span>
            </motion.h2>
            <motion.p className={styles.desc} variants={rise}>
              {t("why.desc")}
            </motion.p>

            <motion.nav className={styles.nav} variants={rise}>
              {BLOCKS.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  className={`${styles.navItem} ${
                    activeId === block.id ? styles.navItemActive : ""
                  }`}
                  onClick={() => scrollToBlock(block.id)}
                >
                  {activeId === block.id ? (
                    <motion.span
                      layoutId="whyNavMarker"
                      className={styles.navMarker}
                      transition={{ duration: 0.4, ease: EASE_OUT }}
                    />
                  ) : null}
                  {t(`why.items.${block.id}.title`)}
                </button>
              ))}
            </motion.nav>
          </motion.div>
        </aside>

        <div className={styles.blocks}>
          {BLOCKS.map((block) => (
            <motion.article
              key={block.id}
              className={styles.block}
              data-block-id={block.id}
              ref={(node: HTMLElement | null) => {
                if (node) blockRefs.current.set(block.id, node);
                else blockRefs.current.delete(block.id);
              }}
              {...staggerParent(0.14, 0, VIEWPORT_TALL)}
            >
              <motion.header className={styles.blockHeader} variants={rise}>
                <h3 className={styles.blockTitle}>{t(`why.items.${block.id}.title`)}</h3>
                <p className={styles.blockDesc}>{t(`why.items.${block.id}.desc`)}</p>
              </motion.header>

              <motion.div className={styles.card} variants={rise}>
                <div className={styles.cardBg} aria-hidden="true">
                  <img src={block.bg} alt="" />
                  <span className={styles.cardTint} />
                  <span className={styles.cardFade} />
                </div>

                <motion.img
                  src={block.image}
                  alt={t(`why.items.${block.id}.title`)}
                  className={styles.shot}
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
