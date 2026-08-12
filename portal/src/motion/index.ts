import type { MotionProps, Variants } from "framer-motion";

/** Expo-out curve: fast start, long settle. Shared by every landing animation. */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const VIEWPORT: MotionProps["viewport"] = { once: true, amount: 0.3 };

/** Blocks taller than the viewport never reach `amount: 0.3`, so they need a lower threshold. */
export const VIEWPORT_TALL: MotionProps["viewport"] = { once: true, amount: 0.12 };

/** Scroll-triggered fade + rise for a single element. */
export function fadeUp(delay = 0, distance = 28, duration = 0.7): MotionProps {
  return {
    initial: { opacity: 0, y: distance },
    whileInView: { opacity: 1, y: 0 },
    viewport: VIEWPORT,
    transition: { duration, delay, ease: EASE_OUT },
  };
}

/** Variant tree root: children animate in sequence once the parent enters the viewport. */
export function staggerParent(
  staggerChildren = 0.1,
  delayChildren = 0,
  viewport: MotionProps["viewport"] = VIEWPORT,
): MotionProps {
  return {
    initial: "hidden",
    whileInView: "show",
    viewport,
    variants: { hidden: {}, show: { transition: { staggerChildren, delayChildren } } },
  };
}

/** Same variant tree, but played on mount (above-the-fold content). */
export function staggerOnMount(staggerChildren = 0.1, delayChildren = 0): MotionProps {
  return {
    initial: "hidden",
    animate: "show",
    variants: { hidden: {}, show: { transition: { staggerChildren, delayChildren } } },
  };
}

export const rise: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.6, ease: EASE_OUT } },
};

/** Image settling from a slight over-zoom. */
export const zoomOut: Variants = {
  hidden: { opacity: 0, scale: 1.06 },
  show: { opacity: 1, scale: 1, transition: { duration: 1.1, ease: EASE_OUT } },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE_OUT } },
};

const lift: Variants = { rest: { y: 0 }, hover: { y: -2 } };

/**
 * Hover lift for buttons. Framer writes an inline `transform`, so hover offsets must live
 * here instead of CSS `:hover` on the same element.
 */
export const hoverLift: MotionProps = {
  initial: "rest",
  animate: "rest",
  whileHover: "hover",
  whileTap: { scale: 0.98 },
  variants: lift,
  transition: { duration: 0.2, ease: "easeOut" },
};

/** Trailing arrow inside a `hoverLift` button — inherits the parent's hover state. */
export const hoverArrow: Variants = { rest: { x: 0 }, hover: { x: 4 } };
