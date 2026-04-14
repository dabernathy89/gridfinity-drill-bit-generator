/**
 * Unit conversion helpers for drill-bit diameters.
 *
 * Bit diameters are stored canonically in millimeters regardless of the user's
 * preferred display unit. These pure helpers handle conversion on entry and
 * formatting on display.
 */

export type BitUnit = "metric" | "imperial";

export const MM_PER_INCH = 25.4;

export function mmFromInches(inches: number): number {
  return inches * MM_PER_INCH;
}

export function inchesFromMm(mm: number): number {
  return mm / MM_PER_INCH;
}

/**
 * Normalize a user-entered diameter to millimeters. Imperial values are
 * assumed to be inches; metric values are already in millimeters.
 */
export function normalizeDiameterMm(value: number, unit: BitUnit): number {
  return unit === "imperial" ? mmFromInches(value) : value;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

function formatMetric(diameterMm: number): string {
  // Round to 3 decimals, strip trailing zeros, keep a plain integer where possible.
  const rounded = Math.round(diameterMm * 1000) / 1000;
  const str = rounded.toFixed(3).replace(/\.?0+$/, "");
  return `${str} mm`;
}

/**
 * Render a millimeter diameter as the nearest inch fraction with the given
 * power-of-two denominator (default 64ths — finer than any common drill index).
 */
function formatImperialFraction(diameterMm: number, denominator = 64): string {
  const inches = inchesFromMm(diameterMm);
  const whole = Math.floor(inches);
  const frac = inches - whole;
  let num = Math.round(frac * denominator);
  let den = denominator;

  if (num === den) {
    return `${whole + 1}"`;
  }
  if (num === 0) {
    return `${whole}"`;
  }

  const g = gcd(num, den);
  num = num / g;
  den = den / g;

  if (whole > 0) {
    return `${whole} ${num}/${den}"`;
  }
  return `${num}/${den}"`;
}

/**
 * Pure formatter for displaying a stored (millimeter) diameter in either a
 * metric ("5.5 mm") or imperial-fraction ("1/4\"") representation.
 */
export function toDisplay(diameterMm: number, unit: BitUnit): string {
  return unit === "imperial" ? formatImperialFraction(diameterMm) : formatMetric(diameterMm);
}

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * Parse a user-entered diameter string in the given unit.
 *
 * Metric accepts plain decimals ("5", "5.5", "3.175").
 * Imperial accepts decimals ("0.25"), plain fractions ("1/4", "3/8") and
 * mixed numbers ("1 1/2"). Trailing inch marks (`"`) are tolerated.
 *
 * Returned numeric value is in the input unit (mm for metric, inches for
 * imperial) and should be passed through `normalizeDiameterMm` before storing.
 */
export function parseDiameter(input: string, unit: BitUnit): ParseResult {
  const trimmed = input.trim().replace(/"$/, "").trim();
  if (trimmed === "") {
    return { ok: false, error: "Enter a diameter." };
  }

  let value: number;
  if (unit === "imperial") {
    const mixed = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    const fraction = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (mixed) {
      const whole = Number(mixed[1]);
      const num = Number(mixed[2]);
      const den = Number(mixed[3]);
      if (den === 0) return { ok: false, error: "Denominator cannot be zero." };
      value = whole + num / den;
    } else if (fraction) {
      const num = Number(fraction[1]);
      const den = Number(fraction[2]);
      if (den === 0) return { ok: false, error: "Denominator cannot be zero." };
      value = num / den;
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        return { ok: false, error: "Enter a decimal or fraction (e.g. 0.25 or 1/4)." };
      }
      value = n;
    }
  } else {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      return { ok: false, error: "Enter a decimal diameter (e.g. 5.5)." };
    }
    value = n;
  }

  if (value <= 0) {
    return { ok: false, error: "Diameter must be greater than zero." };
  }
  return { ok: true, value };
}
