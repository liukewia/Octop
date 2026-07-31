/**
 * Global app store (zustand)
 *
 * Add slices here as the portal grows.
 * Pattern: each slice lives in its own file and is composed here.
 */
import { create } from "zustand";

interface AppState {
  /** Locale currently active in the UI */
  locale: "en" | "zh";
  setLocale: (locale: "en" | "zh") => void;
}

export const useAppStore = create<AppState>()((set) => ({
  locale: "en",
  setLocale: (locale) => set({ locale }),
}));
