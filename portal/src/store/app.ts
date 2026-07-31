/**
 * Global app store (zustand)
 *
 * Add slices here as the portal grows.
 * Pattern: each slice lives in its own file and is composed here.
 *
 * Locale state is managed by i18next (see src/i18n.ts + src/utils/localePrefs.ts).
 */
import { create } from "zustand";

interface AppState {
  // placeholder for future global state
  _placeholder: null;
}

export const useAppStore = create<AppState>()(() => ({
  _placeholder: null,
}));
