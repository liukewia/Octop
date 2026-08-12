import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import octopusAvatar from "@/assets/landing/octopus-avatar.webp";
import octopusType from "@/assets/landing/octopus-type.png";
import underlineInstall from "@/assets/landing/underline-install.svg";
import { cn } from "@/lib/utils";
import { EASE_OUT, fadeUp, popIn, rise, staggerParent } from "@/motion";

type Method = "script" | "pip" | "docker";
type Platform = "mac" | "win_ps" | "win_cmd";
type Segment = { text: string; tone?: "flag" | "path" | "exec" };

const METHODS: Method[] = ["script", "pip", "docker"];
const PLATFORMS: Platform[] = ["mac", "win_ps", "win_cmd"];

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
        <motion.div
          className="relative pb-[310px] max-[1280px]:pb-0"
          {...staggerParent(0.12)}
        >
          <motion.h2
            className="relative inline-block text-[42px] leading-[50px] font-semibold text-black max-[600px]:text-[32px] max-[600px]:leading-10"
            variants={rise}
          >
            {t("install.title")}
            <img
              src={underlineInstall}
              alt=""
              className="pointer-events-none absolute top-10 left-[-1px] h-3.5 w-[170px] select-none"
            />
          </motion.h2>
          <motion.p
            className="text-ink-muted mt-8 text-xl leading-7 max-[600px]:text-base max-[600px]:leading-6"
            variants={rise}
          >
            {t("install.desc")}
          </motion.p>
          <motion.img
            src={octopusType}
            alt=""
            className="absolute left-[-8px] h-auto w-[310px] max-[1280px]:static max-[1280px]:mt-6 max-[1280px]:block max-[1280px]:w-[220px]"
            variants={popIn}
          />
        </motion.div>

        <motion.div
          className="overflow-hidden rounded-landing-md border border-line-subtle bg-surface-subtle"
          {...fadeUp(0.1, 36)}
        >
          <div className="flex h-11 items-center gap-[26px] bg-[#f2f2f2] px-4" role="tablist">
            {METHODS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={method === item}
                className={cn(
                  "text-ink-secondary relative cursor-pointer border-none bg-transparent p-0 font-[inherit] text-sm transition-colors duration-200 ease-out hover:text-ink",
                  method === item && "text-ink font-medium",
                )}
                onClick={() => setMethod(item)}
              >
                {t(`install.methods.${item}`)}
                {method === item ? (
                  <motion.span
                    layoutId="installTabUnderline"
                    className="absolute inset-x-0 bottom-[-13px] h-0.5 rounded-sm bg-ink"
                    transition={{ duration: 0.35, ease: EASE_OUT }}
                  />
                ) : null}
              </button>
            ))}
          </div>

          <div className="flex items-start gap-3 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-[0.75px] border-[#ffe3e3] bg-[#ffebeb] max-[600px]:hidden">
              <img
                src={octopusAvatar}
                alt=""
                className="size-8 object-contain object-bottom"
              />
            </span>

            <div className="flex min-w-0 flex-1 flex-col items-center gap-8 rounded-landing-sm bg-white px-5 py-12 max-[600px]:gap-5 max-[600px]:px-3 max-[600px]:py-6">
              {method === "script" ? (
                <div className="flex h-8 items-center justify-center rounded-landing-sm bg-[#eee] p-[3px] max-[600px]:h-auto max-[600px]:flex-wrap">
                  {PLATFORMS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={cn(
                        "text-ink relative inline-flex h-[26px] cursor-pointer items-center justify-center rounded border-none bg-transparent px-4 py-[5px] font-[inherit] text-xs leading-5 whitespace-nowrap",
                        platform === item && "font-medium",
                      )}
                      onClick={() => setPlatform(item)}
                    >
                      {platform === item ? (
                        <motion.span
                          layoutId="installPlatformPill"
                          className="absolute inset-0 rounded bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                          transition={{ duration: 0.3, ease: EASE_OUT }}
                        />
                      ) : null}
                      <span className="relative">{t(`install.platforms.${item}`)}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex w-full flex-col gap-3">
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
                <div className="relative flex min-h-[212px] items-center justify-center rounded-landing-sm bg-[#f5f5f5] px-14 py-10 max-[600px]:min-h-[140px] max-[600px]:py-6 max-[600px]:pr-10 max-[600px]:pl-4">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.code
                      key={`${method}-${platform}`}
                      className="text-ink text-center font-[inherit] text-sm leading-[22px] break-all"
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
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
