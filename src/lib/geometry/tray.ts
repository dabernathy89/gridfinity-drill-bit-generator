/**
 * Part B — parametric bit tray (US-008).
 *
 * `buildTray(input)` returns a single JSCAD `Geom3` for the tray. The same
 * function call drives the live preview (US-010) and the STL export (US-011):
 * per CLAUDE.md there is exactly one geometry pipeline, no fork between
 * preview and export.
 *
 * Axis convention in the returned solid:
 * - X: along the Gridfinity row (`widthU × 42 mm`). The dovetail rail sits at
 *   the -X end; the last hole is at the +X end. Bits are laid out in a
 *   staggered two-row pattern along X.
 * - Y: across the tray on the baseplate (`heightUnits7mm × 7 mm`). The two
 *   bit rows are centered in Y; labels sit in the strip between them.
 * - Z: up from the print bed. The tray is printed bit-holes-up; the dovetail
 *   rail is on the -X face with its axis of symmetry at the tray's Z midline.
 *
 * Layout constants are shared with `src/lib/validation.ts` so the validator's
 * footprint check and the generator's actual row placement never drift apart.
 */

import type { Geom2, Geom3 } from "@jscad/modeling/src/geometries/types";
import {
  booleans,
  expansions,
  extrusions,
  geometries,
  primitives,
  text,
  transforms,
} from "@jscad/modeling";
import { GRIDFINITY_U_MM, TRAY_DOVETAIL_END_MARGIN_MM, TRAY_WALL_MM } from "../validation";
import {
  buildTrayDovetailCrossSection,
  DOVETAIL_ANGLE_DEG,
  DOVETAIL_RAIL_LENGTH_MM,
} from "./dovetail";

/** Fixed Y "unit" for footprint sizing per CLAUDE.md. */
const SEVEN_MM_UNIT = 7;

/** Floor thickness under the drilled holes. Keeps the tray rigid and the
 * bit tips from poking through. */
export const TRAY_FLOOR_THICKNESS_MM = 2;

/**
 * Fixed tray Z height. Sized so the dovetail rail's full tip extent
 * (`2 × dovetailTipHalfMm`) fits inside with ≥ 1.5 mm of wall above and
 * below the tip. Tall enough to stabilize a drill bit shank without
 * wasting filament.
 */
export const TRAY_HEIGHT_MM = 16;

/** Depth of each drilled hole, measured down from the top face. */
export const TRAY_HOLE_DEPTH_MM = TRAY_HEIGHT_MM - TRAY_FLOOR_THICKNESS_MM;

/** Height of embossed/recessed label glyphs. Readable at print resolution. */
export const LABEL_HEIGHT_MM = 3.5;

/** Recess depth for labels — shallow enough to avoid weakening the tray top,
 * deep enough to survive a few layers of first-layer squish. */
export const LABEL_DEPTH_MM = 0.4;

/** Stroke width for the vector-text polylines expanded into 2D label shapes. */
const LABEL_STROKE_MM = 0.3;

export interface TrayBit {
  /** Canonical diameter in millimeters (matches `Bit.diameterMm` in the
   * store). */
  diameterMm: number;
  /** Human-readable label rendered next to the hole. Empty strings are
   * skipped so untitled bits don't punch a random artifact. */
  label: string;
}

export interface TrayFootprint {
  widthU: number;
  heightUnits7mm: number;
}

export interface TrayCalibration {
  drillHoleToleranceMm: number;
  dovetailOffsetMm: number;
}

export interface TrayInput {
  bits: readonly TrayBit[];
  footprint: TrayFootprint;
  calibration: TrayCalibration;
}

interface HolePlacement {
  bit: TrayBit;
  holeDiameterMm: number;
  centerXmm: number;
  centerYmm: number;
  /** Row index (0 = front, 1 = back) so labels can be placed on the
   * correct side of the hole. */
  rowIndex: 0 | 1;
}

/**
 * Compute the (center X, center Y, row index) of every bit hole. Exposed
 * for unit tests so the layout contract can be asserted without inspecting
 * JSCAD polygons.
 */
export function layoutHoles(
  bits: readonly TrayBit[],
  footprint: TrayFootprint,
  calibration: TrayCalibration,
): HolePlacement[] {
  if (bits.length === 0) return [];

  let largestDiameterMm = 0;
  for (const bit of bits) {
    if (bit.diameterMm > largestDiameterMm) largestDiameterMm = bit.diameterMm;
  }
  const largestHoleMm = largestDiameterMm + calibration.drillHoleToleranceMm;
  const pitchMm = largestHoleMm + TRAY_WALL_MM;

  const trayDepthMm = footprint.heightUnits7mm * SEVEN_MM_UNIT;
  // Two rows centered in Y, each row's center at 1/4 and 3/4 of the depth.
  const rowAYmm = trayDepthMm * 0.25;
  const rowBYmm = trayDepthMm * 0.75;

  // First column's center: TRAY_DOVETAIL_END_MARGIN_MM reserved + wall + halfHole.
  const firstCenterXmm = TRAY_DOVETAIL_END_MARGIN_MM + TRAY_WALL_MM + largestHoleMm / 2;

  return bits.map((bit, i) => {
    const column = Math.floor(i / 2);
    const rowIndex: 0 | 1 = i % 2 === 0 ? 0 : 1;
    const centerXmm = firstCenterXmm + column * pitchMm;
    const centerYmm = rowIndex === 0 ? rowAYmm : rowBYmm;
    return {
      bit,
      holeDiameterMm: bit.diameterMm + calibration.drillHoleToleranceMm,
      centerXmm,
      centerYmm,
      rowIndex,
    };
  });
}

function buildHoleSolid(placement: HolePlacement): Geom3 {
  // Slightly over-deep cylinder, then translate so the top of the cylinder
  // sits *above* the tray top face — guarantees a clean through-cut on
  // subtract even with floating-point drift.
  const radius = placement.holeDiameterMm / 2;
  // +0.1 over-reach above the top face, +0.01 past the floor to avoid a
  // near-coplanar face when subtracting.
  const cylHeight = TRAY_HOLE_DEPTH_MM + 0.1;
  const cyl = primitives.cylinder({
    radius,
    height: cylHeight,
    segments: 48,
  });
  // Cylinder is centered at origin; its top will be at Z = TRAY_HEIGHT_MM
  // and its bottom at Z = TRAY_FLOOR_THICKNESS_MM - 0.01.
  const zCenter = TRAY_HEIGHT_MM - (TRAY_HOLE_DEPTH_MM / 2 - 0.05);
  return transforms.translate([placement.centerXmm, placement.centerYmm, zCenter], cyl);
}

/**
 * Render a label string as a 2D geometry suitable for extrusion. The
 * vector-text polylines are expanded into thin filled strokes (see
 * `LABEL_STROKE_MM`) and unioned into a single Geom2. Returns `null` for
 * empty / whitespace-only strings so the caller can skip them.
 */
function buildLabelGeom2(labelText: string, heightMm: number): Geom2 | null {
  const trimmed = labelText.trim();
  if (trimmed.length === 0) return null;

  const segments = text.vectorText({ input: trimmed, height: heightMm });
  const strokes: Geom2[] = [];
  for (const polyline of segments) {
    if (polyline.length < 2) continue;
    const path = geometries.path2.fromPoints({ closed: false }, polyline);
    const thickened = expansions.expand(
      { delta: LABEL_STROKE_MM / 2, corners: "round", segments: 8 },
      path,
    );
    strokes.push(thickened);
  }
  if (strokes.length === 0) return null;
  return strokes.length === 1 ? strokes[0] : booleans.union(...strokes);
}

function buildLabelSolid(placement: HolePlacement): Geom3 | null {
  const label2d = buildLabelGeom2(placement.bit.label, LABEL_HEIGHT_MM);
  if (label2d === null) return null;

  // Extrude LABEL_DEPTH_MM + a small over-reach so the recess cuts cleanly
  // through the top face when subtracted.
  const extruded = extrusions.extrudeLinear({ height: LABEL_DEPTH_MM + 0.02 }, label2d);

  // Vector text is laid out left-aligned starting at the 2D origin, baseline
  // on Y = 0. Shift so the glyph's approximate centerline sits at the origin,
  // then translate to the chosen label anchor on the tray. Labels go on the
  // *inboard* side of each hole (toward the tray's Y midline) so the two
  // rows have a readable gutter between them.
  const radius = placement.holeDiameterMm / 2;
  const labelCenterOffsetMm = radius + TRAY_WALL_MM / 2 + LABEL_HEIGHT_MM / 2;
  const dirY = placement.rowIndex === 0 ? +1 : -1;
  const labelCenterYmm = placement.centerYmm + dirY * labelCenterOffsetMm;
  // Center the label horizontally on the hole's X; vectorText doesn't emit a
  // width, so approximate width as `LABEL_HEIGHT_MM * 0.6 * glyphCount` for
  // a rough center. Small misalignment is acceptable at this resolution —
  // labels are visual aids, not dimensional features.
  const approxWidth = placement.bit.label.trim().length * LABEL_HEIGHT_MM * 0.6;
  const labelOriginXmm = placement.centerXmm - approxWidth / 2;
  // Recess sits at the top face, pocketed LABEL_DEPTH_MM deep.
  const labelOriginZmm = TRAY_HEIGHT_MM - LABEL_DEPTH_MM;

  // vectorText uses Y for baseline; rotate into the XY plane such that Y-up
  // in 2D maps to Y-on-tray (unchanged), extrude is along Z (into the tray
  // top), perfect as-is.
  return transforms.translate(
    [labelOriginXmm, labelCenterYmm - LABEL_HEIGHT_MM / 2, labelOriginZmm],
    extruded,
  );
}

/**
 * Build the dovetail rail as a 3D solid occupying X ∈ [0, margin], the full
 * Y depth, and a centered Z band whose half-height flares from ROOT at X=margin
 * to TIP at X=0. See `dovetail.ts` for the profile definition.
 */
function buildDovetailRail(trayDepthMm: number, dovetailOffsetMm: number): Geom3 {
  const crossSection = buildTrayDovetailCrossSection(DOVETAIL_RAIL_LENGTH_MM, dovetailOffsetMm);
  // The 2D cross-section is drawn with its X mapping to world X and its Y
  // mapping to world Z. `extrudeLinear` extrudes along +Z for trayDepthMm,
  // so at this point the prism's extrusion axis is world Z. We rotate +π/2
  // around world X to swing that extrusion axis into world Y:
  //   (x, y, z) → (x, -z, y). Extrusion from z=0..depth becomes y=-depth..0,
  // which we correct with a +depth translation in Y.
  const prism = extrusions.extrudeLinear({ height: trayDepthMm }, crossSection);
  const rotated = transforms.rotateX(Math.PI / 2, prism);
  const translated = transforms.translate([0, trayDepthMm, TRAY_HEIGHT_MM / 2], rotated);
  return translated;
}

/**
 * Build the Part B tray as a single Geom3. An empty bit list yields just the
 * body shell + dovetail rail (still a valid solid — the caller gates export
 * on `bits.length > 0` separately).
 */
export function buildTray(input: TrayInput): Geom3 {
  const { bits, footprint, calibration } = input;

  const trayWidthMm = footprint.widthU * GRIDFINITY_U_MM;
  const trayDepthMm = footprint.heightUnits7mm * SEVEN_MM_UNIT;

  // Body spans the full widthU, including the 4mm dovetail region on -X.
  // The dovetail rail replaces the body's -X face; we model the whole body as
  // a single cuboid and union the rail on top (the rail extends above/below
  // the body's -X face where the trapezoid is wider than the wall).
  const body = transforms.translate(
    [trayWidthMm / 2, trayDepthMm / 2, TRAY_HEIGHT_MM / 2],
    primitives.cuboid({ size: [trayWidthMm, trayDepthMm, TRAY_HEIGHT_MM] }),
  );
  const rail = buildDovetailRail(trayDepthMm, calibration.dovetailOffsetMm);
  let solid: Geom3 = booleans.union(body, rail);

  // Subtract drill holes + label pockets. Empty arrays cleanly short-circuit
  // (booleans.subtract with only the base would be wrong — it expects ≥2
  // arguments — so guard).
  const placements = layoutHoles(bits, footprint, calibration);
  const holes = placements.map(buildHoleSolid);
  const labels = placements.map(buildLabelSolid).filter((g): g is Geom3 => g !== null);
  const cuts = [...holes, ...labels];
  if (cuts.length > 0) {
    solid = booleans.subtract(solid, ...cuts);
  }

  return solid;
}

/**
 * Re-export the dovetail contract angle so downstream code (including the
 * US-009 hinge base) can sanity-check that it's using the same value.
 */
export { DOVETAIL_ANGLE_DEG };
