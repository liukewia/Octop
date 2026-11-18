import i18n from "i18next";

import en from "./locales/en.json" with { type: "json" };
import zh from "./locales/zh.json" with { type: "json" };

/**
 * Shell copy via i18next. Chinese is any language tag starting with ``zh``;
 * everything else is English. The renderer binds react-i18next before the
 * first init. The main process calls ``changeShellLanguage`` from the OS locale.
 */

export type ShellLocale = "zh" | "en";

export function shellLanguage(language: string | undefined | null): ShellLocale {
  return (language ?? "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function initShellI18n(language: string | null | undefined = "zh"): void {
  const lng = shellLanguage(language);
  if (!i18n.isInitialized) {
    i18n.init({
      resources: {
        zh: { translation: zh },
        en: { translation: en },
      },
      lng,
      fallbackLng: "en",
      supportedLngs: ["zh", "en"],
      nonExplicitSupportedLngs: true,
      interpolation: { escapeValue: false },
      initImmediate: false,
      showSupportNotice: false,
    });
    return;
  }
  if (i18n.resolvedLanguage !== lng) {
    void i18n.changeLanguage(lng);
  }
}

/** Translated string. Initializes on the default language when boot has not run. */
export function shellT(key: string, options?: Record<string, unknown>): string {
  if (!i18n.isInitialized) initShellI18n();
  return i18n.t(key, options);
}

export function changeShellLanguage(language: string | undefined | null): void {
  initShellI18n(language);
}

export { i18n };
