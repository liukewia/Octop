import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import ctaBeach from "@/assets/landing/cta-beach.png";
import octopMascotType from "@/assets/landing/octop-mascot-type.webp";
import { EASE_OUT, hoverArrow, hoverLift, rise, staggerParent } from "@/motion";
import styles from "./CtaSection.module.less";

export function CtaSection() {
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  // Zoom instead of shift: the backdrop is anchored to the section top, so growing it can
  // never uncover an edge or crop the pale sky that blends into the white fade above.
  const backdropScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);

  return (
    <section className={styles.section} ref={sectionRef}>
      <div className={styles.backdrop} aria-hidden="true">
        <motion.img
          src={ctaBeach}
          alt=""
          loading="lazy"
          style={{ scale: backdropScale, transformOrigin: "center top" }}
        />
        <span className={styles.fade} />
      </div>

      <motion.div className={styles.inner} {...staggerParent(0.12)}>
        <motion.h2 className={styles.title} variants={rise}>
          {t("cta.title")}
        </motion.h2>
        <motion.div variants={rise}>
          <motion.a className={styles.button} href="#install" {...hoverLift}>
            {t("cta.button")}
            <motion.span className={styles.buttonArrow} variants={hoverArrow}>
              <ArrowRight size={20} />
            </motion.span>
          </motion.a>
        </motion.div>
      </motion.div>

      <motion.img
        src={octopMascotType}
        alt=""
        className={styles.mascot}
        loading="lazy"
        initial={{ opacity: 0, y: 64, scaleX: -1 }}
        whileInView={{ opacity: 1, y: 0, scaleX: -1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, delay: 0.15, ease: EASE_OUT }}
      />
    </section>
  );
}
