export type UiLocale = "zh" | "en";

export const UI_LOCALE_STORAGE_KEY = "octop:ui-locale";

/** Map browser language tags to a supported portal locale. */
export function detectBrowserLocale(): UiLocale {
  if (typeof navigator === "undefined") return "en";

  const candidates =
    navigator.languages?.length > 0
      ? navigator.languages
      : [navigator.language];

  for (const raw of candidates) {
    const lang = raw?.toLowerCase() ?? "";
    if (lang.startsWith("zh")) return "zh";
    if (lang.startsWith("en")) return "en";
  }

  const primary = navigator.language?.toLowerCase() ?? "";
  if (primary.startsWith("zh")) return "zh";
  if (primary.startsWith("en")) return "en";

  return "en";
}

export function normalizeUiLocale(raw: string | null | undefined): UiLocale {
  if (!raw) return "en";
  return raw.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function readStoredUiLocale(): UiLocale | null {
  try {
    const raw = localStorage.getItem(UI_LOCALE_STORAGE_KEY);
    if (raw === "zh" || raw === "en") return raw;
  } catch {
    // localStorage unavailable
  }
  return null;
}

export function storeUiLocale(locale: UiLocale): void {
  try {
    localStorage.setItem(UI_LOCALE_STORAGE_KEY, locale);
  } catch {
    // quota / disabled
  }
}

/** Stored user preference wins; otherwise default to Chinese. */
export function resolveInitialLocale(): UiLocale {
  return readStoredUiLocale() ?? "zh";
}

export function syncDocumentLang(locale: UiLocale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
}

/** Landing screenshots with UI copy: default (zh) vs `*-en.png` for English. */
export function pickLocalizedAsset(zhSrc: string, enSrc: string, locale: string): string {
  return normalizeUiLocale(locale) === "en" ? enSrc : zhSrc;
}
