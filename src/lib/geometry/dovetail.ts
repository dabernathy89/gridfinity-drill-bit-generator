/**
 * Dovetail contract shared between the parametric tray (Part B, US-008) and
 * the fixed hinge base (Part A, US-009). The dovetail is the cross-part
 * mechanical contract per CLAUDE.md — its angle is a hard-coded constant and
 * the fit offset is user-overridable via calibration.
 *
 * Profile orientation (used by `buildTray`):
 * - The rail runs along the Y axis (the slide direction).
 * - Its cross-section sits in the XZ plane: narrower at the body-root
 *   (X = `lengthMm`) and wider at the free tip (X = 0). Flanks flare outward
 *   in Z as X decreases so the rail cannot pull out of the slot in ±Z.
 *
 * The 60° value follows the dovetail-cutter convention: each flank is angled
 * 60° from the horizontal (slide) plane, i.e., 30° from vertical. For a tray
 * printed bit-holes-up, the bottom flank is the overhang surface, and its
 * 30°-from-vertical tilt is well inside the 45° supportless ceiling from
 * CLAUDE.md.
 */

import type { Geom2 } from "@jscad/modeling/src/geometries/types";
import { geometries } from "@jscad/modeling";

/** Cross-part contract: dovetail cutter angle (flank from horizontal). */
export const DOVETAIL_ANGLE_DEG = 60;

/**
 * Actual X-length of the male rail. Less than `TRAY_DOVETAIL_END_MARGIN_MM`
 * (= 4 mm) so the rail's root has a body-wall buttress behind it and the
 * tip doesn't have to grow so tall that it blows past the tray's Z extent.
 */
export const DOVETAIL_RAIL_LENGTH_MM = 3;

/** Half-height of the rail at the body-root (narrow end). The neck is
 * deliberately thin so there's plenty of flank flare within the tray's
 * Z envelope. */
export const DOVETAIL_ROOT_HALF_MM = 1;

/** Flank slope (dZ / dX) derived from the 60° cutter angle. */
const FLANK_SLOPE = Math.tan((DOVETAIL_ANGLE_DEG * Math.PI) / 180);

/** Half-height of the rail at the free tip (wide end). Derived from the
 * spec angle and rail length so it stays consistent even if one of them
 * changes. */
export function dovetailTipHalfMm(lengthMm: number): number {
  return DOVETAIL_ROOT_HALF_MM + lengthMm * FLANK_SLOPE;
}

/**
 * Build the 2D dovetail rail cross-section (in XZ, centered on Z = 0) for
 * a male rail of the given length in X, inset by `offsetMm` so the printed
 * rail runs loose inside a nominal female slot. Returns a Geom2 suitable
 * for `extrudeLinear` along Y.
 *
 * Inset reduces both the root and tip half-heights by `offsetMm`, leaving
 * the flank angle unchanged (the rail is scaled uniformly in Z, not X).
 */
export function buildTrayDovetailCrossSection(lengthMm: number, offsetMm: number): Geom2 {
  const hRoot = Math.max(0.1, DOVETAIL_ROOT_HALF_MM - offsetMm);
  const hTip = Math.max(hRoot + 0.1, dovetailTipHalfMm(lengthMm) - offsetMm);
  // Trapezoid in XZ, counter-clockwise when looking down +Y:
  //   (lengthMm, -hRoot) → (lengthMm,  hRoot) → (0,  hTip) → (0, -hTip)
  return geometries.geom2.fromPoints([
    [lengthMm, -hRoot],
    [lengthMm, hRoot],
    [0, hTip],
    [0, -hTip],
  ]);
}
