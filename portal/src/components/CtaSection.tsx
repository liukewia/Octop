import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import ctaBeach from "@/assets/landing/cta-beach.png";
import ctaBeachOctop from "@/assets/landing/cta-beach-octop.png";
import { EASE_OUT, hoverArrow, hoverLift, rise, staggerParent } from "@/motion";

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
    <section
      className="relative mt-[200px] flex min-h-[420px] items-center overflow-hidden max-[900px]:mt-24 max-[900px]:min-h-80"
      ref={sectionRef}
    >
      <div className="absolute inset-0" aria-hidden="true">
        <motion.img
          src={ctaBeach}
          alt=""
          loading="lazy"
          className="size-full object-cover object-bottom"
          style={{ scale: backdropScale, transformOrigin: "center top" }}
        />
        <span className="absolute inset-0 bg-linear-to-b from-white to-white/0 to-[42%]" />
      </div>

      <motion.div
        className="page-container relative z-[1] flex flex-col items-start gap-12 pt-[60px]"
        {...staggerParent(0.12)}
      >
        <motion.h2
          className="max-w-[934px] text-[40px] leading-[48px] font-semibold text-black max-[900px]:max-w-[calc(100%-160px)] max-[900px]:text-[28px] max-[900px]:leading-9 max-[600px]:max-w-[calc(100%-116px)] max-[600px]:text-[24px] max-[600px]:leading-8"
          variants={rise}
        >
          {t("cta.title")}
        </motion.h2>
        <motion.div variants={rise}>
          <motion.a
            className="inline-flex h-[50px] items-center gap-2 rounded-landing-md bg-black px-9 text-lg leading-[26px] font-medium tracking-[-0.45px] text-white no-underline max-[900px]:h-12 max-[900px]:gap-1.5 max-[900px]:px-7 max-[900px]:text-base max-[600px]:h-10 max-[600px]:px-5 max-[600px]:text-sm"
            href="#install"
            {...hoverLift}
          >
            {t("cta.button")}
            <motion.span className="inline-flex" variants={hoverArrow}>
              <ArrowRight className="size-5 max-[900px]:size-[18px] max-[600px]:size-4" />
            </motion.span>
          </motion.a>
        </motion.div>
      </motion.div>

      {/* Wide layout: park the octopus 80px inside the (max 1440px) content column instead of a
          viewport percentage, so it keeps the same distance from the copy as the window grows. */}
      <motion.img
        src={ctaBeachOctop}
        alt=""
        className="absolute top-[16%] right-[calc(50%-560px)] bottom-0 z-[1] my-auto h-auto w-[320px] -scale-x-100 max-[1440px]:w-[280px] max-[1280px]:right-[4%] max-[1280px]:w-[200px] max-[900px]:right-5 max-[900px]:w-[136px] max-[600px]:right-3 max-[600px]:w-[104px]"
        loading="lazy"
        initial={{ opacity: 0, y: 64, scaleX: -1 }}
        whileInView={{ opacity: 1, y: 0, scaleX: -1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, delay: 0.15, ease: EASE_OUT }}
      />
    </section>
  );
}
