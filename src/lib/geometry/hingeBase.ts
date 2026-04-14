/**
 * Part A — universal hinge base (US-009).
 *
 * Static chassis distributed as a pre-made STL. It sits directly on a
 * Gridfinity baseplate (magnet recesses on the underside) and accepts the
 * parametric tray (Part B) via a female 60° dovetail slot. A print-in-place
 * (PIP) cone hinge lets the tray-carrying leaf tilt up; a tactile detent
 * catches it at the fully-open (90°) position.
 *
 * Unlike `buildTray`, this module is "non-parametric" — the geometry does
 * not depend on the user's bit list, footprint, or set name. Per CLAUDE.md
 * the tolerances (hinge clearances, dovetail offset) must still be user-
 * overridable, so `buildHingeBase` takes an OPTIONAL calibration object and
 * defaults to the spec values. Callers can invoke it with zero args to get
 * the spec-default STL.
 *
 * Axis convention (same world frame as `buildTray` so the two STLs can be
 * previewed side-by-side without another transform):
 * - X: along the Gridfinity row. Also the hinge axis.
 * - Y: across the baseplate (into the tray). The tray's dovetail rail
 *   slides along Y to engage the slot.
 * - Z: up from the print bed.
 *
 * The body sits in X ∈ [0, 42], Y ∈ [0, 42], Z ∈ [0, HINGE_BASE_HEIGHT_MM].
 * The hinge barrel protrudes -Y beyond the body at the -Y edge.
 */

import type { Geom3 } from "@jscad/modeling/src/geometries/types";
import { booleans, extrusions, primitives, transforms } from "@jscad/modeling";
import { GRIDFINITY_U_MM } from "../validation";
import {
  DOVETAIL_ANGLE_DEG,
  DOVETAIL_RAIL_LENGTH_MM,
  buildHingeDovetailSlotCrossSection,
} from "./dovetail";

/** Hinge base footprint along X (one Gridfinity 1U cell). */
export const HINGE_BASE_WIDTH_MM = GRIDFINITY_U_MM;

/** Hinge base footprint along Y (one Gridfinity 1U cell). */
export const HINGE_BASE_DEPTH_MM = GRIDFINITY_U_MM;

/** Total vertical extent of the hinge base body. Matches `TRAY_HEIGHT_MM`
 * on the tray side so the slot's Z midline is identical between the two
 * halves — makes preview-side-by-side layouts cleaner and leaves enough
 * vertical room for the dovetail tip's full flare (≈12.4mm tall at the
 * default rail length) with ≥1mm wall above and below. */
export const HINGE_BASE_HEIGHT_MM = 16;

/** Baseplate thickness. The magnet recesses live in this lower slab so the
 * body above retains full wall thickness for the slot + hinge. */
export const BASE_PLATE_THICKNESS_MM = 4;

/** Gridfinity-convention magnet (6×2 neodymium). Diameter is the hole, not
 * the magnet — matches the Gridfinity baseplate spec. */
export const MAGNET_DIAMETER_MM = 6;
export const MAGNET_DEPTH_MM = 2;

/** Distance from each corner of the 42×42 footprint to each magnet center
 * along BOTH X and Y. Matches the Gridfinity baseplate / bin convention. */
export const MAGNET_CORNER_INSET_MM = 8;

/** Outer radius of the PIP cone hinge barrel that protrudes -Y from the
 * body at the hinge edge. Sized so the interior cone + radial clearance
 * fits inside with ≥0.8mm barrel wall. */
export const HINGE_BARREL_RADIUS_MM = 3.5;

/** Cone base radius (the wide end of the cone that sits inside the barrel).
 * Leaves a ~0.8mm shell between cone and barrel wall at nominal clearance. */
export const HINGE_CONE_BASE_RADIUS_MM = 2.0;

/** Cone tip radius (the narrow end near the axial split). Not a sharp point
 * so the clearance-inflated slot stays well inside the barrel wall. */
export const HINGE_CONE_TIP_RADIUS_MM = 0.6;

/** Axial length of each cone half, measured from the axial split outward.
 * Two mating cones (chassis + leaf) meet tip-to-tip at the midpoint. */
export const HINGE_CONE_LENGTH_MM = 4;

/** Radius of the spherical detent bump that sits on the barrel's +Z face at
 * the X-midpoint, giving the leaf a tactile catch at 90° open. */
export const DETENT_BUMP_RADIUS_MM = 0.6;

/**
 * Calibration inputs the hinge base honors. Mirrors the relevant subset of
 * `Calibration` in the store — callers can pass `store.calibration` directly
 * or leave it off to use the CLAUDE.md defaults.
 */
export interface HingeBaseCalibration {
  /** PIP hinge radial clearance, mm. Adds to the cone cavity radii so the
   * printed cone can spin inside its cavity. */
  hingeRadialMm: number;
  /** PIP hinge axial clearance, mm. Thickness of the planar split between
   * the chassis and leaf halves of the barrel. */
  hingeAxialMm: number;
  /** Growth applied to the female dovetail slot. Nominally 0 — the male
   * rail on the tray carries the `dovetailOffsetMm` shrink. Exposed here so
   * a calibration panel can loosen both halves if desired. */
  dovetailOffsetMm: number;
}

/** CLAUDE.md spec defaults. Must match `DEFAULT_CALIBRATION` in the store
 * for the relevant fields (plus a 0 default for the female slot growth,
 * which the store's `dovetailOffsetMm` does NOT apply to). */
export const HINGE_BASE_DEFAULT_CALIBRATION: HingeBaseCalibration = {
  hingeRadialMm: 0.3,
  hingeAxialMm: 0.2,
  dovetailOffsetMm: 0,
};

/** Midline Z of the dovetail slot. Set to the body's vertical midline so
 * the slot's flare (tip half-height ≈ 6.2mm at the default rail length) is
 * symmetric about center and leaves ~1.8mm of wall above and below. Matches
 * the tray's rail Z center so the two halves mate cleanly. */
const SLOT_CENTER_Z_MM = HINGE_BASE_HEIGHT_MM / 2;

/** Y coord where the slot dead-ends (blind stop). Placed past the hinge
 * barrel so the slot cut doesn't eat the barrel wall at Y < barrelRadius. */
const SLOT_BACK_END_Y_MM = HINGE_BARREL_RADIUS_MM + 1.5;

/** Where the inside of the barrel starts — interior radius the cone features
 * live inside. Leaves a barrel wall of ≈0.8mm. */
const BARREL_INTERIOR_RADIUS_MM = HINGE_BARREL_RADIUS_MM - 0.8;

/**
 * Build the Part A hinge base as a single Geom3.
 *
 * The returned solid may have internal clearance voids (the PIP hinge split
 * plus cone cavities) that appear as a disconnected mesh in the STL; that's
 * intentional — it's what makes the hinge print-in-place.
 */
export function buildHingeBase(
  calibration: HingeBaseCalibration = HINGE_BASE_DEFAULT_CALIBRATION,
): Geom3 {
  // Main chassis block, spanning the full 42×42 footprint in X/Y.
  const body = transforms.translate(
    [HINGE_BASE_WIDTH_MM / 2, HINGE_BASE_DEPTH_MM / 2, HINGE_BASE_HEIGHT_MM / 2],
    primitives.cuboid({
      size: [HINGE_BASE_WIDTH_MM, HINGE_BASE_DEPTH_MM, HINGE_BASE_HEIGHT_MM],
    }),
  );

  // Hinge barrel: cylinder with axis along X, sitting on the -Y edge at
  // Z = barrel radius above the baseplate top (so its lower edge rests on
  // the baseplate). The barrel's outer shell becomes one continuous
  // surface with the body's -Y face.
  const barrel = transforms.translate(
    [HINGE_BASE_WIDTH_MM / 2, 0, barrelCenterZ()],
    transforms.rotateY(
      Math.PI / 2,
      primitives.cylinder({
        radius: HINGE_BARREL_RADIUS_MM,
        height: HINGE_BASE_WIDTH_MM,
        segments: 64,
      }),
    ),
  );

  // 90° tactile detent bump. Added BEFORE the hinge cavity subtraction so
  // the bump survives the cone/axial-slot cuts (the cuts live inside the
  // barrel; the bump sits on its exterior). Union-shaped, shallow sphere
  // on the barrel's +Z crown at the X midpoint.
  const detent = transforms.translate(
    [HINGE_BASE_WIDTH_MM / 2, 0, barrelCenterZ() + HINGE_BARREL_RADIUS_MM],
    primitives.sphere({ radius: DETENT_BUMP_RADIUS_MM, segments: 24 }),
  );

  let solid: Geom3 = booleans.union(body, barrel, detent);

  const cuts: Geom3[] = [];
  cuts.push(...buildMagnetRecessCuts());
  cuts.push(...buildHingeCavityCuts(calibration));
  cuts.push(buildDovetailSlotCut(calibration));

  solid = booleans.subtract(solid, ...cuts);
  return solid;
}

/** Center Z of the hinge barrel. Exposed for test assertions. */
export function barrelCenterZ(): number {
  return BASE_PLATE_THICKNESS_MM + HINGE_BARREL_RADIUS_MM;
}

/**
 * Four magnet recesses on the underside, one at each Gridfinity corner
 * (8mm inset in both X and Y). Cut from the baseplate.
 */
function buildMagnetRecessCuts(): Geom3[] {
  const radius = MAGNET_DIAMETER_MM / 2;
  // Over-reach below the bed by 0.01 so the subtract leaves no near-coplanar face.
  const height = MAGNET_DEPTH_MM + 0.02;
  const centers: Array<[number, number]> = [
    [MAGNET_CORNER_INSET_MM, MAGNET_CORNER_INSET_MM],
    [HINGE_BASE_WIDTH_MM - MAGNET_CORNER_INSET_MM, MAGNET_CORNER_INSET_MM],
    [MAGNET_CORNER_INSET_MM, HINGE_BASE_DEPTH_MM - MAGNET_CORNER_INSET_MM],
    [HINGE_BASE_WIDTH_MM - MAGNET_CORNER_INSET_MM, HINGE_BASE_DEPTH_MM - MAGNET_CORNER_INSET_MM],
  ];
  return centers.map(([x, y]) =>
    transforms.translate(
      // Cylinder is Z-centered on origin; lift so its top sits at Z = MAGNET_DEPTH_MM
      // and its bottom dips below Z = 0 by 0.01.
      [x, y, height / 2 - 0.01],
      primitives.cylinder({ radius, height, segments: 32 }),
    ),
  );
}

/**
 * Expose the four magnet recess centers so tests can assert Gridfinity
 * placement without digging through polygons. Keyed left-to-right, front-to-back.
 */
export function magnetRecessCenters(): Array<[number, number]> {
  return [
    [MAGNET_CORNER_INSET_MM, MAGNET_CORNER_INSET_MM],
    [HINGE_BASE_WIDTH_MM - MAGNET_CORNER_INSET_MM, MAGNET_CORNER_INSET_MM],
    [MAGNET_CORNER_INSET_MM, HINGE_BASE_DEPTH_MM - MAGNET_CORNER_INSET_MM],
    [HINGE_BASE_WIDTH_MM - MAGNET_CORNER_INSET_MM, HINGE_BASE_DEPTH_MM - MAGNET_CORNER_INSET_MM],
  ];
}

/**
 * Cuts that implement the print-in-place cone hinge:
 * - An axial slot (a thin disk) at the barrel's X-midpoint, splitting it
 *   into a chassis-half and a leaf-half. Thickness = `hingeAxialMm`.
 * - Two matching cone cavities — one on each side of the split — that
 *   create the cone pair. Radii are inflated by `hingeRadialMm` so the
 *   printed cone can spin freely.
 *
 * The two cones meet tip-to-tip at the split. At print time the chassis's
 * cone prints as a solid (from `body`); the leaf's cone cavity is the void
 * these cuts carve out of the barrel; an overhanging bridge above the gap
 * lets the leaf's cone tip hang in place with clearance on all sides.
 *
 * This is a geometry representation — the printed part's mechanical fidelity
 * depends on the slicer and printer, which is why the tolerances are
 * user-overridable.
 */
function buildHingeCavityCuts(calibration: HingeBaseCalibration): Geom3[] {
  const midX = HINGE_BASE_WIDTH_MM / 2;
  const cz = barrelCenterZ();
  const axialGap = Math.max(calibration.hingeAxialMm, 0.05);
  const halfGap = axialGap / 2;

  // Axial split: thin disk across the barrel interior, thickness = hingeAxialMm.
  const axialSlot = transforms.translate(
    [midX, 0, cz],
    transforms.rotateY(
      Math.PI / 2,
      primitives.cylinder({
        radius: BARREL_INTERIOR_RADIUS_MM,
        height: axialGap,
        segments: 48,
      }),
    ),
  );

  // Cone cavities on each side. cylinderElliptic is centered at the origin
  // with its axis along Z; startRadius sits at Z = -h/2 and endRadius at
  // Z = +h/2. After rotateY(π/2) the axis runs along X with startRadius at
  // -h/2 in X and endRadius at +h/2.
  const coneBaseR = HINGE_CONE_BASE_RADIUS_MM + calibration.hingeRadialMm;
  const coneTipR = HINGE_CONE_TIP_RADIUS_MM + calibration.hingeRadialMm;
  const coneLen = HINGE_CONE_LENGTH_MM;

  // Chassis-side cavity: base at X = midX - halfGap - coneLen (toward -X),
  // tip at X = midX - halfGap (toward the split). So startRadius = base (wide),
  // endRadius = tip (narrow). Center of the cone sits at midX - halfGap - coneLen/2.
  const chassisCone = transforms.translate(
    [midX - halfGap - coneLen / 2, 0, cz],
    transforms.rotateY(
      Math.PI / 2,
      primitives.cylinderElliptic({
        startRadius: [coneBaseR, coneBaseR],
        endRadius: [coneTipR, coneTipR],
        height: coneLen,
        segments: 48,
      }),
    ),
  );

  // Leaf-side cavity: mirror. Tip at X = midX + halfGap (toward the split),
  // base at X = midX + halfGap + coneLen (toward +X). startRadius sits at -h/2
  // after rotation, i.e., at X = midX + halfGap (tip); endRadius at base.
  const leafCone = transforms.translate(
    [midX + halfGap + coneLen / 2, 0, cz],
    transforms.rotateY(
      Math.PI / 2,
      primitives.cylinderElliptic({
        startRadius: [coneTipR, coneTipR],
        endRadius: [coneBaseR, coneBaseR],
        height: coneLen,
        segments: 48,
      }),
    ),
  );

  return [axialSlot, chassisCone, leafCone];
}

/**
 * Female dovetail slot cut from the body. XZ cross-section from the shared
 * dovetail contract, extruded along +Y so the slot runs the full Y depth
 * (through the body). The slot's mouth is on the +X face (the rail enters
 * from +X and slides along Y).
 *
 * Note on orientation: when mated, the tray's rail (extruded along Y, root
 * at X = rail-length, tip at X = 0 in the tray's own frame) slides into this
 * channel. The rail's narrow root sits at the slot's mouth (world +X face
 * of the hinge base); the wide tip sits at the deepest X of the slot. Same
 * profile as `buildTrayDovetailCrossSection` but grown by `dovetailOffsetMm`
 * rather than shrunk.
 */
function buildDovetailSlotCut(calibration: HingeBaseCalibration): Geom3 {
  const cross = buildHingeDovetailSlotCrossSection(
    DOVETAIL_RAIL_LENGTH_MM,
    calibration.dovetailOffsetMm,
  );
  // extrudeLinear runs along +Z. The 2D X becomes world X, 2D Y becomes world Z.
  // After extrudeLinear({height: slotLen}): solid spans X ∈ [0, rail-length],
  // Z_world (before rotate) = 2D Y = [-hTip, +hTip], extrusion along Z = [0, slotLen].
  // Rotate +π/2 about X: (x,y,z) → (x, -z, y). After rotation extrusion is along Y
  // (spanning y = -slotLen..0), and the former extrusion Z becomes -Y.
  const slotLengthY = HINGE_BASE_DEPTH_MM - SLOT_BACK_END_Y_MM;
  const prism = extrusions.extrudeLinear({ height: slotLengthY }, cross);
  const rotated = transforms.rotateX(Math.PI / 2, prism);
  // Shift so the slot's mouth (at X=lengthMm in the cross-section) sits at
  // world X = HINGE_BASE_WIDTH_MM (i.e., on the +X face of the body); push
  // Y from [-slotLen, 0] to [SLOT_BACK_END_Y_MM, HINGE_BASE_DEPTH_MM]; place
  // Z center at SLOT_CENTER_Z_MM.
  return transforms.translate(
    [HINGE_BASE_WIDTH_MM - DOVETAIL_RAIL_LENGTH_MM, HINGE_BASE_DEPTH_MM, SLOT_CENTER_Z_MM],
    rotated,
  );
}

/** Re-export the dovetail contract angle so downstream code can sanity-check
 * that it matches the tray's value (both must be 60 per CLAUDE.md). */
export { DOVETAIL_ANGLE_DEG };

/** Exposed so tests can check slot placement without touching polygons. */
export { SLOT_CENTER_Z_MM };
