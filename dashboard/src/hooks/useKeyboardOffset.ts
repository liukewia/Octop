import { useEffect } from "react";

/** Home-indicator / browser chrome is ~34–50px; real keyboards are 200px+. */
export const KEYBOARD_GAP_THRESHOLD_PX = 80;

export function isPwa(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/**
 * VisualViewport leftover after subtracting offsetTop. Tiny gaps are the
 * iOS home indicator, not a keyboard — those must stay 0 or CSS that also
 * adds `env(safe-area-inset-bottom)` will paint two empty bands.
 */
export function measureKeyboardOffset(
  innerHeight: number,
  viewport: Pick<VisualViewport, "height" | "offsetTop">,
): number {
  const raw = Math.max(0, innerHeight - viewport.height - viewport.offsetTop);
  return raw > KEYBOARD_GAP_THRESHOLD_PX ? Math.round(raw) : 0;
}

/**
 * Non-PWA browsers: the fixed shell can sit under Safari/Chrome toolbars
 * (and the soft keyboard). Use the full visualViewport shortfall so the
 * composer `max(safe-area, --keyboard-offset)` clears that overlap.
 */
export function measureViewportBottomOverlap(
  innerHeight: number,
  viewport: Pick<VisualViewport, "height" | "offsetTop">,
): number {
  return Math.round(
    Math.max(0, innerHeight - viewport.height - viewport.offsetTop),
  );
}

/**
 * Tracks `--keyboard-offset` on the document root for mobile bottom layout.
 *
 * - PWA: ignore home-indicator-sized gaps (safe-area CSS owns that band);
 *   only lift for a real soft keyboard.
 * - Browser: apply the full visualViewport shortfall so toolbars do not
 *   cover the chat composer.
 */
export function useKeyboardOffset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const pwa = isPwa();

    const update = () => {
      const offset = pwa
        ? measureKeyboardOffset(window.innerHeight, vv)
        : measureViewportBottomOverlap(window.innerHeight, vv);
      document.documentElement.style.setProperty(
        "--keyboard-offset",
        `${offset}px`,
      );
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--keyboard-offset");
    };
  }, []);
}
