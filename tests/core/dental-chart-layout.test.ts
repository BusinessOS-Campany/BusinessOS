import { describe, expect, it } from "vitest";
import {
  H_GAP,
  TOOTH_W_BASE,
  TOOTH_W_MIN,
  computeToothWidth,
  toothRowWidth,
} from "../../system/dental/src/lib/dental-chart-layout";

// Why the 2D chart overflowed on phones.
//
// Each arch row holds 16 teeth (two quads of 8) with one 24px gap between the
// quads, so the row is 16 * toothW + 24 wide. The component sized a tooth as
// `(gridW - 24) / 8` - the *quad* divisor - which produced a row roughly twice
// the container width. On a 390px phone the arch measured ~584px against a
// 306px container and the whole page over-scrolled horizontally, cropping
// teeth on both edges (measured: document 390 -> 476 scrollWidth).
//
// The invariant this test locks: a tooth must be sized from the *row* divisor
// (16), so the full arch fits the visible width whenever a reasonable tooth
// size allows it, and collapses to a floor (with a horizontal-scroll wrapper
// as the fallback) on very narrow screens.
const fitsWithin = (gridW: number) => toothRowWidth(computeToothWidth(gridW)) <= Math.max(gridW, toothRowWidth(TOOTH_W_MIN));

describe("dental chart arch layout", () => {
  it("sizes a tooth from the whole 16-tooth row, not one 8-tooth quad", () => {
    // Old formula: (300 - 24) / 8 = 34.5 -> row 576px on a 300px viewport.
    // Row formula: fills exactly `gridW` once above the floor.
    expect(toothRowWidth(computeToothWidth(300))).toBeLessThanOrEqual(300);
  });

  it("banks a full 16-tooth arch (no horizontal overflow) across phone and tablet widths", () => {
    const phoneGrids = [236, 290, 306, 320, 360, 390, 414, 430, 480, 600, 696];
    for (const gridW of phoneGrids) {
      expect(fitsWithin(gridW), `row must fit a ${gridW}px grid`).toBe(true);
    }
  });

  it("clamps to the base tooth width on wide screens, still fitting the container", () => {
    expect(computeToothWidth(1000)).toBe(TOOTH_W_BASE);
    expect(toothRowWidth(TOOTH_W_BASE)).toBe(16 * TOOTH_W_BASE + H_GAP);
    expect(fitsWithin(1000)).toBe(true);
  });

  it("never sizes a tooth below the minimum tappable floor", () => {
    expect(computeToothWidth(1)).toBe(TOOTH_W_MIN);
    expect(computeToothWidth(0)).toBe(TOOTH_W_BASE); // pre-measurement fallback
    expect(toothRowWidth(TOOTH_W_MIN)).toBe(16 * TOOTH_W_MIN + H_GAP);
  });
});