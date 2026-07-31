import en from "./en";
import zh from "./zh";

export type Locale = "en" | "zh";

// Recursive type helper to make all values string-accessible
type TranslationValue = string | { [key: string]: TranslationValue };

export const translations: Record<Locale, typeof en> = { en, zh };

function getNestedValue(obj: Record<string, TranslationValue>, path: string): string {
  const keys = path.split(".");
  let current: TranslationValue = obj;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) return path;
    current = (current as Record<string, TranslationValue>)[key];
    if (current === undefined) return path;
  }
  return typeof current === "string" ? current : path;
}

export function createT(locale: Locale) {
  return function t(key: string): string {
    return getNestedValue(
      translations[locale] as unknown as Record<string, TranslationValue>,
      key,
    );
  };
}

export { en, zh };
