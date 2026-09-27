import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  KEYBOARD_GAP_THRESHOLD_PX,
  measureKeyboardOffset,
  measureViewportBottomOverlap,
  useKeyboardOffset,
} from "./useKeyboardOffset";

describe("measureKeyboardOffset", () => {
  it("ignores home-indicator-sized leftover as a closed keyboard", () => {
    expect(measureKeyboardOffset(844, { height: 810, offsetTop: 0 })).toBe(0);
    expect(
      measureKeyboardOffset(844, {
        height: 844 - KEYBOARD_GAP_THRESHOLD_PX,
        offsetTop: 0,
      }),
    ).toBe(0);
  });

  it("reports a real soft keyboard", () => {
    expect(measureKeyboardOffset(844, { height: 500, offsetTop: 0 })).toBe(344);
  });

  it("subtracts visualViewport.offsetTop before comparing", () => {
    expect(measureKeyboardOffset(844, { height: 500, offsetTop: 40 })).toBe(
      304,
    );
  });
});

describe("measureViewportBottomOverlap", () => {
  it("reports browser-chrome-sized leftovers that PWA keyboard measure ignores", () => {
    expect(
      measureViewportBottomOverlap(844, { height: 810, offsetTop: 0 }),
    ).toBe(34);
    expect(measureKeyboardOffset(844, { height: 810, offsetTop: 0 })).toBe(0);
  });

  it("reports a soft keyboard the same way as the rounded leftover", () => {
    expect(
      measureViewportBottomOverlap(844, { height: 500, offsetTop: 0 }),
    ).toBe(344);
  });
});

describe("useKeyboardOffset", () => {
  const originalMatchMedia = window.matchMedia;
  const originalVisualViewport = window.visualViewport;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: originalVisualViewport,
    });
    document.documentElement.style.removeProperty("--keyboard-offset");
  });

  function stubVisualViewport(height: number, offsetTop = 0) {
    const vv = {
      height,
      offsetTop,
      width: 390,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: vv,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });
    return vv;
  }

  it("sets browser-chrome overlap outside PWA standalone", () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as typeof window.matchMedia;
    stubVisualViewport(810);

    renderHook(() => useKeyboardOffset());

    expect(
      document.documentElement.style.getPropertyValue("--keyboard-offset"),
    ).toBe("34px");
  });

  it("ignores home-indicator-sized leftover in PWA standalone", () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("display-mode: standalone"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as typeof window.matchMedia;
    stubVisualViewport(810);

    renderHook(() => useKeyboardOffset());

    expect(
      document.documentElement.style.getPropertyValue("--keyboard-offset"),
    ).toBe("0px");
  });
});
