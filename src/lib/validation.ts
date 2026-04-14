/**
 * Pure validation helpers for the bit tray.
 *
 * The authoritative tray geometry lives in the JSCAD `buildTray` module
 * (US-008). This file owns the footprint-fit check — the pure, shared
 * predicate that drives inline UI errors and disables the export buttons
 * when a bit list is too wide for the selected Gridfinity width.
 *
 * The layout constants (wall thickness, end-margin for the dovetail rail)
 * are exported so the tray generator can use the same numbers and stay
 * consistent with the validator.
 */

import type { Bit, Calibration, Footprint } from "../stores/bitSet";

/** One Gridfinity "U" along a baseplate axis. */
export const GRIDFINITY_U_MM = 42;

/** Wall thickness between adjacent holes and at each end of the row. */
export const TRAY_WALL_MM = 2;

/**
 * End-axis margin reserved for the 60° male dovetail rail that couples the
 * tray to the hinge base. A conservative cross-section allowance; the final
 * JSCAD geometry may subdivide this further but will not exceed it.
 */
export const TRAY_DOVETAIL_END_MARGIN_MM = 4;

export interface FitValidationOk {
  ok: true;
}

export interface FitValidationFail {
  ok: false;
  reason: string;
  /** Minimum Gridfinity U width needed to fit this bit list. */
  minWidthU: number;
}

export type FitValidationResult = FitValidationOk | FitValidationFail;

/**
 * Estimate the minimum tray length (along the row axis, in mm) needed to
 * accommodate `bits` using the staggered two-row layout spec'd for US-008.
 *
 * Layout assumptions:
 * - Bits alternate between two rows, so the number of columns is ⌈N / 2⌉.
 * - Column pitch is derived from the largest drilled hole plus a wall.
 *   (Hole diameter = bit diameter + `drillHoleToleranceMm` per CLAUDE.md.)
 * - One wall closes the bit-row end; the opposite end carries the dovetail
 *   rail, which reserves `TRAY_DOVETAIL_END_MARGIN_MM`.
 *
 * Returns 0 for an empty bit list (no tray to build).
 */
export function estimateTrayRowLengthMm(
  bits: readonly Pick<Bit, "diameterMm">[],
  drillHoleToleranceMm: number,
): number {
  if (bits.length === 0) return 0;
  let largestDiameterMm = 0;
  for (const bit of bits) {
    if (bit.diameterMm > largestDiameterMm) largestDiameterMm = bit.diameterMm;
  }
  const largestHoleMm = largestDiameterMm + drillHoleToleranceMm;
  const columns = Math.ceil(bits.length / 2);
  const pitchMm = largestHoleMm + TRAY_WALL_MM;
  return columns * pitchMm + TRAY_WALL_MM + TRAY_DOVETAIL_END_MARGIN_MM;
}

/**
 * The minimum integer Gridfinity U width that would contain this bit row.
 * Always ≥ 1 (a tray has at least one cell even when the row is trivially
 * short).
 */
export function minWidthUForBits(
  bits: readonly Pick<Bit, "diameterMm">[],
  drillHoleToleranceMm: number,
): number {
  const requiredMm = estimateTrayRowLengthMm(bits, drillHoleToleranceMm);
  return Math.max(1, Math.ceil(requiredMm / GRIDFINITY_U_MM));
}

/**
 * Decide whether the current bit list fits the chosen footprint.
 *
 * An empty list is treated as `ok: true` — it is structurally valid; UI
 * code that gates export on a non-empty bit list should check `bits.length`
 * separately.
 */
export function validateFit(
  bits: readonly Pick<Bit, "diameterMm">[],
  footprint: Pick<Footprint, "widthU">,
  calibration: Pick<Calibration, "drillHoleToleranceMm">,
): FitValidationResult {
  if (bits.length === 0) return { ok: true };

  const requiredMm = estimateTrayRowLengthMm(bits, calibration.drillHoleToleranceMm);
  const availableMm = footprint.widthU * GRIDFINITY_U_MM;
  if (requiredMm <= availableMm) return { ok: true };

  const minWidthU = Math.max(1, Math.ceil(requiredMm / GRIDFINITY_U_MM));
  const reason =
    `Bit row needs ≈${requiredMm.toFixed(1)} mm ` +
    `(${minWidthU} U) but only ${footprint.widthU} U ` +
    `(${availableMm} mm) is selected.`;
  return { ok: false, reason, minWidthU };
}
