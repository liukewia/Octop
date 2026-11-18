import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { initReactI18next } from "react-i18next";
import { i18n, initShellI18n, shellLanguage } from "../../shared/shell-i18n";

/**
 * Every shell page is a static HTML file with a single ``#root``. The pages are
 * permanently mounted for the life of the window, so nothing here unmounts.
 * react-i18next is bound before the first init so ``useTranslation`` works.
 */
export function mount(node: ReactNode): void {
  const locale = shellLanguage(navigator.language);
  if (!i18n.isInitialized) i18n.use(initReactI18next);
  initShellI18n(navigator.language);
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  const container = document.getElementById("root");
  if (!container) throw new Error("renderer host element #root is missing");
  createRoot(container).render(<StrictMode>{node}</StrictMode>);
}
