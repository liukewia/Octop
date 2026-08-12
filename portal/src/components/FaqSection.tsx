import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import octopusFaq from "@/assets/landing/octopus-faq.webp";
import underlineFaq from "@/assets/landing/underline-faq.svg";
import { EASE_OUT, popIn, rise, staggerParent } from "@/motion";

const FAQ_IDS = ["open_source", "storage", "skills", "multi_user", "commercial", "os"] as const;

export function FaqSection() {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(FAQ_IDS[0]);

  return (
    <section className="pt-[200px] max-[900px]:pt-24" id="faq">
      <div className="page-container grid grid-cols-[465px_minmax(0,843px)] justify-between gap-[60px] max-[1280px]:grid-cols-[minmax(0,1fr)] max-[1280px]:gap-10">
        <motion.div
          className="relative pb-[300px] max-[1280px]:pb-0"
          {...staggerParent(0.12)}
        >
          <motion.h2
            className="relative inline-block text-[42px] leading-[50px] font-semibold text-black max-[600px]:text-[32px] max-[600px]:leading-10"
            variants={rise}
          >
            {t("faq.title")}
            <img
              src={underlineFaq}
              alt=""
              className="pointer-events-none absolute top-[39px] left-[142px] h-[22px] w-[152px] select-none"
            />
          </motion.h2>
          <motion.p
            className="text-ink-muted mt-8 text-xl leading-7 max-[600px]:text-base max-[600px]:leading-6"
            variants={rise}
          >
            {t("faq.desc")}
          </motion.p>
          <motion.img
            src={octopusFaq}
            alt=""
            className="absolute bottom-[-10px] left-[-53px] h-auto w-[300px] max-[1280px]:static max-[1280px]:mt-6 max-[1280px]:block max-[1280px]:w-[200px]"
            loading="lazy"
            variants={popIn}
          />
        </motion.div>

        <motion.div className="flex flex-col" {...staggerParent(0.08)}>
          {FAQ_IDS.map((id) => {
            const open = openId === id;
            return (
              <motion.div
                key={id}
                className="border-line-strong border-b first:border-t"
                variants={rise}
              >
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between gap-6 border-none bg-transparent py-7 text-left font-[inherit] text-xl leading-7 text-black max-[600px]:text-[17px]"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : id)}
                >
                  <span>{t(`faq.items.${id}.q`)}</span>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={open ? "minus" : "plus"}
                      className="text-ink-secondary inline-flex shrink-0"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                    >
                      {open ? <Minus size={24} /> : <Plus size={24} />}
                    </motion.span>
                  </AnimatePresence>
                </button>

                <AnimatePresence initial={false}>
                  {open ? (
                    <motion.div
                      className="overflow-hidden"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.36, ease: EASE_OUT }}
                    >
                      <p className="text-ink-muted pb-7 text-xl leading-7 max-[600px]:text-base max-[600px]:leading-[26px]">
                        {t(`faq.items.${id}.a`)}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
