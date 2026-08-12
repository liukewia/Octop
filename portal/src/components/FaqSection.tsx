import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import octopusFaq from "@/assets/landing/octopus-faq.webp";
import underlineFaq from "@/assets/landing/underline-faq.svg";
import { EASE_OUT, popIn, rise, staggerParent } from "@/motion";
import styles from "./FaqSection.module.less";

const FAQ_IDS = ["open_source", "storage", "skills", "multi_user", "commercial", "os"] as const;

export function FaqSection() {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(FAQ_IDS[0]);

  return (
    <section className={styles.section} id="faq">
      <div className={styles.inner}>
        <motion.div className={styles.intro} {...staggerParent(0.12)}>
          <motion.h2 className={styles.heading} variants={rise}>
            {t("faq.title")}
            <img src={underlineFaq} alt="" className={styles.underline} />
          </motion.h2>
          <motion.p className={styles.desc} variants={rise}>
            {t("faq.desc")}
          </motion.p>
          <motion.img
            src={octopusFaq}
            alt=""
            className={styles.mascot}
            loading="lazy"
            variants={popIn}
          />
        </motion.div>

        <motion.div className={styles.list} {...staggerParent(0.08)}>
          {FAQ_IDS.map((id) => {
            const open = openId === id;
            return (
              <motion.div key={id} className={styles.item} variants={rise}>
                <button
                  type="button"
                  className={styles.question}
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : id)}
                >
                  <span>{t(`faq.items.${id}.q`)}</span>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={open ? "minus" : "plus"}
                      className={styles.toggleIcon}
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
                      className={styles.answerWrap}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.36, ease: EASE_OUT }}
                    >
                      <p className={styles.answer}>{t(`faq.items.${id}.a`)}</p>
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
