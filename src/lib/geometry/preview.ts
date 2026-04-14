/**
 * Preview-mode composition (US-010).
 *
 * This module does NOT define a separate geometry pipeline. Per CLAUDE.md and
 * the US-007/US-008 test contract, the preview and the STL export must share
 * the exact same JSCAD solid for each part. `buildPreviewSolids` is a thin
 * router: it calls `buildTray` / `buildHingeBase` directly, chooses which to
 * include based on the user's view-mode selection, and translates the tray
 * alongside the hinge base when the user picks "Both assembled" so the two
 * parts can be seen on the same canvas.
 *
 * The returned array of `Geom3`s is what the preview renderer feeds into
 * `entitiesFromSolids`; the US-011 STL exporter will call `buildTray` /
 * `buildHingeBase` directly (never this composition helper).
 */

import type { Geom3 } from "@jscad/modeling/src/geometries/types";
import { transforms } from "@jscad/modeling";
import type { Bit, Calibration, Footprint } from "../../stores/bitSet";
import { buildTray } from "./tray";
import { HINGE_BASE_DEPTH_MM, HINGE_BASE_WIDTH_MM, buildHingeBase } from "./hingeBase";

/** What the user has asked to see on the preview canvas. */
export type PreviewMode = "tray" | "hinge" | "both";

/**
 * Preview input bundle. Shape-compatible with the Pinia `useBitSetStore`
 * refs so callers can pass `{ bits, footprint, calibration }` directly.
 * `Calibration` is the full store shape (all four tolerances) because this
 * module routes calibration to both `buildTray` and `buildHingeBase`, each
 * of which consumes a different subset.
 */
export interface PreviewInput {
  bits: readonly Pick<Bit, "diameterMm" | "label">[];
  footprint: Footprint;
  calibration: Calibration;
}

/** Fixed Y "unit" for tray depth sizing, matches `tray.ts`. */
const SEVEN_MM_UNIT = 7;

/**
 * Compute the translation applied to the tray in "both" mode so it sits next
 * to the hinge base. Placed on the +X side of the hinge (the slot-mouth side)
 * with aligned +Y edges so the pair reads as "tray + hinge that the tray
 * slides into". Exposed for testing — the component itself just calls
 * `buildPreviewSolids`.
 */
export function trayOffsetForAssembledView(trayDepthMm: number): [number, number, number] {
  // Flush the tray's -X face against the hinge base's +X face (the slot-
  // opening face). Align the tray's +Y edge with the hinge base's +Y edge
  // so the two parts look registered on the back (mount-side) edge; if the
  // tray is shallower than the hinge base the tray hangs off the front.
  const dx = HINGE_BASE_WIDTH_MM;
  const dy = Math.max(0, HINGE_BASE_DEPTH_MM - trayDepthMm);
  return [dx, dy, 0];
}

/**
 * Build the solids to render for the given view mode.
 *
 * - `"tray"` → one `Geom3` from `buildTray(input)`.
 * - `"hinge"` → one `Geom3` from `buildHingeBase(calibration)`.
 * - `"both"` → both, with the tray translated next to the hinge base.
 *
 * `buildTray` / `buildHingeBase` are the single source of geometry; this
 * helper never synthesizes its own shapes.
 */
export function buildPreviewSolids(mode: PreviewMode, input: PreviewInput): Geom3[] {
  const solids: Geom3[] = [];

  if (mode === "tray" || mode === "both") {
    const tray = buildTray({
      bits: input.bits,
      footprint: input.footprint,
      calibration: {
        drillHoleToleranceMm: input.calibration.drillHoleToleranceMm,
        dovetailOffsetMm: input.calibration.dovetailOffsetMm,
      },
    });
    if (mode === "both") {
      const trayDepthMm = input.footprint.heightUnits7mm * SEVEN_MM_UNIT;
      solids.push(transforms.translate(trayOffsetForAssembledView(trayDepthMm), tray));
    } else {
      solids.push(tray);
    }
  }

  if (mode === "hinge" || mode === "both") {
    solids.push(
      buildHingeBase({
        hingeRadialMm: input.calibration.hingeRadialMm,
        hingeAxialMm: input.calibration.hingeAxialMm,
        // The female slot nominally stays at 0 — the male rail carries the
        // spec offset — but callers can override by changing
        // `calibration.dovetailOffsetMm`, which the hinge module clamps to
        // non-negative internally.
        dovetailOffsetMm: 0,
      }),
    );
  }

  return solids;
}
