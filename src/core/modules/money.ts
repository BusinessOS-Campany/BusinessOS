/**
 * Money/quantity arithmetic helpers. ALL business math flows through these so
 * floats never touch money: prices are bigint minor units, quantities become
 * bigint milli-units (3 dp fixed-point) before multiplication.
 */
export const QTY_SCALE = 1000n;

/** Decimal(18,3)-compatible quantity → milli-units (float-free). */
export function qtyToMilli(qty: number | string): bigint {
  const s = typeof qty === "number" ? qty.toFixed(3) : String(qty);
  const [int, frac = ""] = s.split(".");
  const frac3 = (frac + "000").slice(0, 3);
  return BigInt(int) * QTY_SCALE + BigInt(frac3 || "0");
}

/** Milli-units back to a plain number for storage/display. */
export function milliToQty(milli: bigint): number {
  return Number(milli) / Number(QTY_SCALE);
}

/**
 * price(milliqty / scale) with banker-friendly floor at half a minor unit.
 * Returns minor units as bigint.
 */
export function mulPriceQty(priceMinor: bigint, qtyMilli: bigint): bigint {
  return (priceMinor * qtyMilli) / QTY_SCALE;
}

/** Percentage in basis points, floored. */
export function bpsOf(amountMinor: bigint, bps: number): bigint {
  return (amountMinor * BigInt(bps)) / 10000n;
}
