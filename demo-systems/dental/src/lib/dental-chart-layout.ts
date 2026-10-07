/**
 * Arch sizing maths for the 2D dental chart.
 *
 * A row is 16 teeth (two quads of 8) with one `H_GAP` gap between the quads,
 * so a row needs `16 * toothW + H_GAP` of width. The chart therefore sizes a
 * tooth from the *row* divisor (16). The original code divided by 8 - the
 * per-quad divisor - which produced a row roughly twice the container and made
 * the page scroll sideways on a phone with teeth cropped off both edges.
 *
 * `TOOTH_W_MIN` keeps a tooth big enough to tap on a small screen; narrower
 * grids fall back to a horizontal-scroll wrapper in the chart itself rather
 * than shrinking further.
 */
export const TOOTH_W_BASE = 42
export const TOOTH_W_MIN = 15

/** Gap between the two quad groups in one row. */
export const H_GAP = 24

/** Teeth in one row (both quads). */
const ROW_TEETH = 16

/** Tooth button width in CSS px for a given visible chart width. */
export function computeToothWidth(gridWidth: number): number {
  if (gridWidth <= 0) return TOOTH_W_BASE
  return Math.min(TOOTH_W_BASE, Math.max(TOOTH_W_MIN, (gridWidth - H_GAP) / ROW_TEETH))
}

/** Width the whole 16-tooth row needs at this tooth width. */
export function toothRowWidth(toothWidth: number): number {
  return ROW_TEETH * toothWidth + H_GAP
}
