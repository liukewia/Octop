import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  resolveInitialLocale,
  syncDocumentLang,
  storeUiLocale,
  type UiLocale,
} from "./utils/localePrefs";

export type { UiLocale } from "./utils/localePrefs";

async function loadLocaleBundle(locale: UiLocale) {
  if (locale === "zh") {
    return (await import("./locales/zh.json")).default;
  }
  return (await import("./locales/en.json")).default;
}

export async function ensureLocaleBundle(locale: UiLocale): Promise<void> {
  if (!i18n.hasResourceBundle(locale, "translation")) {
    const bundle = await loadLocaleBundle(locale);
    i18n.addResourceBundle(locale, "translation", bundle, true, true);
  }
}

/** Change the active locale and persist the preference. */
export async function changeLocale(locale: UiLocale): Promise<void> {
  storeUiLocale(locale);
  await ensureLocaleBundle(locale);
  await i18n.changeLanguage(locale);
}

let initPromise: Promise<void> | null = null;

export function initI18n(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const initial = resolveInitialLocale();
      const fallback: UiLocale = initial === "zh" ? "en" : "zh";
      const primaryBundle = await loadLocaleBundle(initial);

      await i18n.use(initReactI18next).init({
        resources: {
          [initial]: { translation: primaryBundle },
        },
        lng: initial,
        fallbackLng: fallback,
        supportedLngs: ["zh", "en"],
        nonExplicitSupportedLngs: true,
        interpolation: {
          escapeValue: false,
        },
      });

      syncDocumentLang(initial);
      document.title = i18n.t("app.pageTitle");

      // Prefetch the fallback bundle during idle time
      const prefetchFallback = () => {
        void ensureLocaleBundle(fallback);
      };
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(prefetchFallback);
      } else {
        setTimeout(prefetchFallback, 2000);
      }

      i18n.on("languageChanged", (lng) => {
        const locale: UiLocale = lng.startsWith("zh") ? "zh" : "en";
        syncDocumentLang(locale);
        document.title = i18n.t("app.pageTitle");
        void ensureLocaleBundle(locale);
      });
    })();
  }
  return initPromise;
}

export default i18n;
