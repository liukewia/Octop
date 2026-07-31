/**
 * Language toggle helper — thin wrapper around i18next + localePrefs.
 * Use `useTranslation()` from react-i18next directly in components.
 * This module is kept for any code that needs programmatic locale access.
 */
export { changeLocale, ensureLocaleBundle } from "@/i18n";
export {
  readStoredUiLocale,
  storeUiLocale,
  resolveInitialLocale,
  type UiLocale,
} from "@/utils/localePrefs";
