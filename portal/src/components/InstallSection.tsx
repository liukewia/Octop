import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import installBg1 from "@/assets/landing/install-bg-1.png";
import installBg2 from "@/assets/landing/install-bg-2.png";
import installBg3 from "@/assets/landing/install-bg-3.png";
import octopHi from "@/assets/landing/octop-hi.png";
import octopusType from "@/assets/landing/octopus-type.png";
import underlineInstall from "@/assets/landing/underline-install.svg";
import { cn } from "@/lib/utils";
import { EASE_OUT, fadeUp, popIn, rise, staggerParent } from "@/motion";

type Method = "script" | "pip" | "docker";
type Platform = "mac" | "win_ps" | "win_cmd";
type Segment = { text: string; tone?: "flag" | "path" | "exec" };

const METHODS: Method[] = ["script", "pip", "docker"];
const PLATFORMS: Platform[] = ["mac", "win_ps", "win_cmd"];

const INSTALL_BG: Record<Method, string> = {
  script: installBg1,
  pip: installBg2,
  docker: installBg3,
};

const RELEASE_BASE = "https://finnie-1258344699.cos.ap-guangzhou.myqcloud.com/octop";

const TONE_CLASS: Record<NonNullable<Segment["tone"]>, string> = {
  flag: "text-[#6222ea]",
  path: "text-[rgb(9_86_220_/_90%)]",
  exec: "text-[#e90602]",
};

const SCRIPT_COMMANDS: Record<Platform, Segment[]> = {
  mac: [
    { text: "curl " },
    { text: "-fsSL", tone: "flag" },
    { text: ` ${RELEASE_BASE}/` },
    { text: "install.sh", tone: "path" },
    { text: " | " },
    { text: "bash", tone: "exec" },
  ],
  win_ps: [
    { text: "irm " },
    { text: `${RELEASE_BASE}/` },
    { text: "install.ps1", tone: "path" },
    { text: " | " },
    { text: "iex", tone: "exec" },
  ],
  win_cmd: [
    { text: "curl " },
    { text: "-fsSL", tone: "flag" },
    { text: ` ${RELEASE_BASE}/` },
    { text: "install.bat", tone: "path" },
    { text: " -o install.bat && " },
    { text: "install.bat", tone: "exec" },
  ],
};

const OTHER_COMMANDS: Record<Exclude<Method, "script">, Segment[]> = {
  pip: [{ text: "pip install " }, { text: "octop", tone: "exec" }],
  docker: [
    { text: "docker compose " },
    { text: "-f", tone: "flag" },
    { text: " docker/docker-compose.yml " },
    { text: "up -d", tone: "exec" },
  ],
};

export function InstallSection() {
  const { t } = useTranslation();
  const [method, setMethod] = useState<Method>("script");
  const [platform, setPlatform] = useState<Platform>("mac");
  const [copied, setCopied] = useState(false);

  const segments = method === "script" ? SCRIPT_COMMANDS[platform] : OTHER_COMMANDS[method];
  const command = segments.map((segment) => segment.text).join("");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="pt-[200px] max-[900px]:pt-24" id="install">
      <div className="page-container grid grid-cols-[465px_minmax(0,859px)] justify-between gap-[60px] max-[1280px]:grid-cols-[minmax(0,1fr)] max-[1280px]:gap-10">
        <motion.div className="relative pb-[310px] max-[1280px]:pb-0" {...staggerParent(0.12)}>
          <motion.h2
            className="relative z-0 inline-block text-[42px] leading-[52px] font-semibold text-black max-[600px]:text-[28px] max-[600px]:leading-9"
            variants={rise}
          >
            {t("install.title")}
            <img
              src={underlineInstall}
              alt=""
              className="pointer-events-none absolute top-[1.12em] left-[-1px] -z-10 h-3.5 w-[calc(100%+8px)] select-none"
            />
          </motion.h2>
          <motion.p
            className="text-ink-faint mt-8 text-base leading-6 max-[600px]:text-[15px]"
            variants={rise}
          >
            {t("install.desc")}
          </motion.p>
          <motion.img
            src={octopusType}
            alt=""
            className="absolute bottom-0 left-[-8px] h-auto w-[310px] max-[1280px]:static max-[1280px]:mt-6 max-[1280px]:block max-[1280px]:w-[220px]"
            variants={popIn}
          />
        </motion.div>

        <motion.div
          className="overflow-hidden rounded-landing-md border border-line-subtle bg-surface-subtle"
          {...fadeUp(0.1, 36)}
        >
          <div
            className="flex h-14 items-stretch gap-8 bg-white px-8 max-[600px]:h-12 max-[600px]:gap-4 max-[600px]:px-4"
            role="tablist"
          >
            {METHODS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={method === item}
                className={cn(
                  "text-ink-secondary relative inline-flex cursor-pointer items-center border-none bg-transparent p-0 font-[inherit] text-[15px] leading-6 transition-colors duration-200 ease-out hover:text-ink max-[600px]:text-[13px]",
                  method === item && "text-ink font-semibold",
                )}
                onClick={() => setMethod(item)}
              >
                {t(`install.methods.${item}`)}
                {method === item ? (
                  <motion.span
                    layoutId="installTabUnderline"
                    className="absolute inset-x-0 bottom-0 h-[3px] rounded-t-sm bg-ink"
                    transition={{ duration: 0.35, ease: EASE_OUT }}
                  />
                ) : null}
              </button>
            ))}
          </div>

          <div className="relative flex items-start gap-3 px-[60px] py-14 max-[900px]:px-8 max-[900px]:py-10 max-[600px]:gap-2 max-[600px]:px-4 max-[600px]:py-6">
            <div className="pointer-events-none absolute inset-0 select-none" aria-hidden="true">
              <AnimatePresence initial={false}>
                <motion.img
                  key={method}
                  src={INSTALL_BG[method]}
                  alt=""
                  className="absolute inset-0 size-full object-cover object-bottom"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: EASE_OUT }}
                />
              </AnimatePresence>
              {/* Fade the gradient out toward the top-left so the orange stays a corner accent. */}
              <span className="absolute inset-0 bg-[linear-gradient(to_bottom_right,#fff_18%,rgb(255_255_255_/_72%)_46%,rgb(255_255_255_/_0%)_88%)]" />
            </div>

            <img
              src={octopHi}
              alt=""
              className="relative size-9 shrink-0 rounded-full object-contain max-[600px]:hidden"
            />

            <div className="relative flex min-w-0 flex-1 flex-col items-center rounded-landing-card bg-white px-12 py-12 shadow-[0_12px_40px_rgba(0,0,0,0.06)] max-[900px]:px-8 max-[600px]:px-4 max-[600px]:py-6">
              {/* The platform row plus its gap is always reserved, so switching tabs never resizes the
                  card; without the row the space is split above and below to keep content centered. */}
              <div
                className={cn(
                  "flex w-full items-start overflow-hidden transition-[height] duration-300 ease-out",
                  method === "script"
                    ? "h-[72px] max-[900px]:h-auto max-[900px]:min-h-[72px] max-[600px]:min-h-[60px] max-[600px]:pb-5"
                    : "h-9 max-[600px]:h-[30px]",
                )}
              >
                <AnimatePresence initial={false}>
                  {method === "script" ? (
                    <motion.div
                      key="platforms"
                      className="relative grid min-h-10 w-full grid-cols-3 items-stretch rounded-landing-sm bg-[#eee] p-[5px]"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                    >
                      {/* The pill is a single element translated by whole columns, so its position never
                          depends on layout measurement of the animating card around it. */}
                      <motion.span
                        className="absolute top-[5px] bottom-[5px] left-[5px] w-[calc((100%-10px)/3)] rounded bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                        initial={false}
                        animate={{ x: `${PLATFORMS.indexOf(platform) * 100}%` }}
                        transition={{ duration: 0.3, ease: EASE_OUT }}
                      />
                      {PLATFORMS.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className={cn(
                            "text-ink relative inline-flex min-h-[30px] min-w-0 cursor-pointer items-center justify-center rounded border-none bg-transparent px-4 py-[5px] text-center font-[inherit] text-[13px] leading-[18px] break-words hyphens-none max-[900px]:px-2 max-[600px]:text-xs",
                            platform === item && "font-medium",
                          )}
                          onClick={() => setPlatform(item)}
                        >
                          {t(`install.platforms.${item}`)}
                        </button>
                      ))}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="flex w-full flex-col gap-6 max-[600px]:gap-4">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={method}
                    className="text-ink-muted text-center text-sm leading-[22px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {t(`install.hints.${method}`)}
                  </motion.p>
                </AnimatePresence>
                <div className="relative flex h-[132px] items-center rounded-landing-md bg-[#f2f2f2] px-10 py-7 max-[900px]:h-auto max-[900px]:min-h-[110px] max-[600px]:min-h-[100px] max-[600px]:py-5 max-[600px]:pr-10 max-[600px]:pl-4">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.code
                      key={`${method}-${platform}`}
                      className="font-fira-code text-ink text-left text-sm leading-[22px] break-words"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.28, ease: EASE_OUT }}
                    >
                      {segments.map((segment, index) => (
                        <span
                          key={`${segment.text}-${index}`}
                          className={segment.tone ? TONE_CLASS[segment.tone] : undefined}
                        >
                          {segment.text}
                        </span>
                      ))}
                    </motion.code>
                  </AnimatePresence>
                  <motion.button
                    type="button"
                    className="text-ink-secondary absolute right-4 bottom-4 inline-flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-1 transition-colors duration-200 ease-out hover:bg-black/[0.06]"
                    onClick={handleCopy}
                    aria-label={t("install.copy")}
                    title={copied ? t("install.copied") : t("install.copy")}
                    whileHover={{ scale: 1.12 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {copied ? <Check size={18} /> : <Copy size={18} />}
                  </motion.button>
                  <AnimatePresence>
                    {copied ? (
                      <motion.span
                        className="text-ink-muted absolute right-11 bottom-[18px] text-xs leading-4"
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.22, ease: EASE_OUT }}
                      >
                        {t("install.copied")}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>

              <div
                className={cn(
                  "w-full transition-[height] duration-300 ease-out",
                  method === "script" ? "h-0" : "h-9 max-[600px]:h-[30px]",
                )}
                aria-hidden="true"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
