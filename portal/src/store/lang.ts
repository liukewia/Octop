import { create } from "zustand";
import type { Locale } from "@/i18n";

interface LangState {
  locale: Locale;
  toggle: () => void;
  setLocale: (l: Locale) => void;
}

const saved = (typeof localStorage !== "undefined" && localStorage.getItem("octop_locale")) as
  | Locale
  | null;

export const useLang = create<LangState>((set) => ({
  locale: saved ?? "en",
  toggle: () =>
    set((s) => {
      const next: Locale = s.locale === "en" ? "zh" : "en";
      localStorage.setItem("octop_locale", next);
      return { locale: next };
    }),
  setLocale: (l) => {
    localStorage.setItem("octop_locale", l);
    set({ locale: l });
  },
}));
