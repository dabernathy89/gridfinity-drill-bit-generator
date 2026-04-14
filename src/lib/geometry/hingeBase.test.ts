import { expect, test } from "vite-plus/test";
import { geometries } from "@jscad/modeling";
import {
  BASE_PLATE_THICKNESS_MM,
  DETENT_BUMP_RADIUS_MM,
  DOVETAIL_ANGLE_DEG,
  HINGE_BARREL_RADIUS_MM,
  HINGE_BASE_DEFAULT_CALIBRATION,
  HINGE_BASE_DEPTH_MM,
  HINGE_BASE_HEIGHT_MM,
  HINGE_BASE_WIDTH_MM,
  MAGNET_CORNER_INSET_MM,
  MAGNET_DEPTH_MM,
  MAGNET_DIAMETER_MM,
  SLOT_CENTER_Z_MM,
  barrelCenterZ,
  buildHingeBase,
  magnetRecessCenters,
} from "./hingeBase";
import {
  DOVETAIL_RAIL_LENGTH_MM,
  dovetailTipHalfMm,
  buildHingeDovetailSlotCrossSection,
} from "./dovetail";
import { GRIDFINITY_U_MM } from "../validation";

function boundsOf(solid: ReturnType<typeof buildHingeBase>) {
  const polygons = geometries.geom3.toPolygons(solid);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const poly of polygons) {
    for (const v of poly.vertices) {
      if (v[0] < minX) minX = v[0];
      if (v[0] > maxX) maxX = v[0];
      if (v[1] < minY) minY = v[1];
      if (v[1] > maxY) maxY = v[1];
      if (v[2] < minZ) minZ = v[2];
      if (v[2] > maxZ) maxZ = v[2];
    }
  }
  return { minX, maxX, minY, maxY, minZ, maxZ, polygonCount: polygons.length };
}

test("buildHingeBase returns a non-empty polygon set at default calibration", () => {
  const solid = buildHingeBase();
  expect(geometries.geom3.toPolygons(solid).length).toBeGreaterThan(0);
});

test("buildHingeBase footprint is a single Gridfinity U (42x42)", () => {
  const solid = buildHingeBase();
  const b = boundsOf(solid);
  // X spans [0, 42] — the body's full width.
  expect(b.minX).toBeCloseTo(0, 6);
  expect(b.maxX).toBeCloseTo(HINGE_BASE_WIDTH_MM, 6);
  expect(HINGE_BASE_WIDTH_MM).toBe(GRIDFINITY_U_MM);
  // Y: body starts at 0 but the hinge barrel protrudes -Y by one barrel
  // radius, so minY is below 0 by that much.
  expect(b.minY).toBeCloseTo(-HINGE_BARREL_RADIUS_MM, 3);
  expect(b.maxY).toBeCloseTo(HINGE_BASE_DEPTH_MM, 6);
  expect(HINGE_BASE_DEPTH_MM).toBe(GRIDFINITY_U_MM);
});

test("buildHingeBase Z spans [0, HINGE_BASE_HEIGHT_MM] plus the detent bump", () => {
  const solid = buildHingeBase();
  const b = boundsOf(solid);
  expect(b.minZ).toBeCloseTo(0, 6);
  // The body top is at HINGE_BASE_HEIGHT_MM. The detent bump sits on the
  // barrel crown (Z = barrelCenterZ + HINGE_BARREL_RADIUS_MM) which is
  // below HINGE_BASE_HEIGHT_MM (barrel crown = 4 + 3.5 + 3.5 = 11), so
  // the body dominates maxZ.
  expect(b.maxZ).toBeCloseTo(HINGE_BASE_HEIGHT_MM, 6);
});

test("barrel sits on the baseplate (barrel bottom ≥ baseplate top)", () => {
  // PIP cone hinges print bed-up; the barrel must rest on (or above) the
  // baseplate surface so the split line is unsupported-overhang-free.
  const cz = barrelCenterZ();
  const barrelBottom = cz - HINGE_BARREL_RADIUS_MM;
  expect(barrelBottom).toBeCloseTo(BASE_PLATE_THICKNESS_MM, 6);
});

test("magnet recesses sit on the Gridfinity 42mm grid at 8mm corner inset", () => {
  const centers = magnetRecessCenters();
  expect(centers).toHaveLength(4);
  // All four corners: (8,8), (34,8), (8,34), (34,34)
  const expected: Array<[number, number]> = [
    [MAGNET_CORNER_INSET_MM, MAGNET_CORNER_INSET_MM],
    [HINGE_BASE_WIDTH_MM - MAGNET_CORNER_INSET_MM, MAGNET_CORNER_INSET_MM],
    [MAGNET_CORNER_INSET_MM, HINGE_BASE_DEPTH_MM - MAGNET_CORNER_INSET_MM],
    [HINGE_BASE_WIDTH_MM - MAGNET_CORNER_INSET_MM, HINGE_BASE_DEPTH_MM - MAGNET_CORNER_INSET_MM],
  ];
  expect(centers).toEqual(expected);

  // Each magnet must stay clear of the footprint edge: center ± radius
  // must be strictly inside [0, 42] on both axes.
  const r = MAGNET_DIAMETER_MM / 2;
  for (const [cx, cy] of centers) {
    expect(cx - r).toBeGreaterThan(0);
    expect(cx + r).toBeLessThan(HINGE_BASE_WIDTH_MM);
    expect(cy - r).toBeGreaterThan(0);
    expect(cy + r).toBeLessThan(HINGE_BASE_DEPTH_MM);
  }
});

test("magnet recess depth is shallower than the baseplate so the top face is intact", () => {
  // Cutting MAGNET_DEPTH_MM from the underside must leave at least some
  // baseplate thickness above the magnet pocket.
  expect(MAGNET_DEPTH_MM).toBeLessThan(BASE_PLATE_THICKNESS_MM);
});

test("dovetail contract angle stays at 60° (matches the tray)", () => {
  expect(DOVETAIL_ANGLE_DEG).toBe(60);
});

test("female slot cross-section is the mate to the tray's rail profile", () => {
  // At offset=0 the slot is the nominal trapezoid: root half-height = 1mm at
  // the mouth (X=lengthMm), tip half-height = dovetailTipHalfMm(length) at
  // the interior (X=0). Build the Geom2 and inspect its outline.
  const slot = buildHingeDovetailSlotCrossSection(DOVETAIL_RAIL_LENGTH_MM, 0);
  const outline = geometries.geom2.toOutlines(slot);
  expect(outline.length).toBeGreaterThan(0);
  const expectedHTip = dovetailTipHalfMm(DOVETAIL_RAIL_LENGTH_MM);
  // Bounding box in 2D: X ∈ [0, lengthMm]; Y ∈ [-hTip, +hTip].
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of outline) {
    for (const v of ring) {
      if (v[0] < minX) minX = v[0];
      if (v[0] > maxX) maxX = v[0];
      if (v[1] < minY) minY = v[1];
      if (v[1] > maxY) maxY = v[1];
    }
  }
  expect(minX).toBeCloseTo(0, 6);
  expect(maxX).toBeCloseTo(DOVETAIL_RAIL_LENGTH_MM, 6);
  expect(minY).toBeCloseTo(-expectedHTip, 6);
  expect(maxY).toBeCloseTo(expectedHTip, 6);
});

test("female slot grows (not shrinks) when dovetailOffsetMm is positive", () => {
  // The male rail carries the spec shrink; the female should grow if
  // anything. Nominal (offset=0) must be smaller than any positive-offset
  // variant.
  const nominal = buildHingeDovetailSlotCrossSection(DOVETAIL_RAIL_LENGTH_MM, 0);
  const loose = buildHingeDovetailSlotCrossSection(DOVETAIL_RAIL_LENGTH_MM, 0.25);

  function verticalExtent(g: ReturnType<typeof buildHingeDovetailSlotCrossSection>) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const ring of geometries.geom2.toOutlines(g)) {
      for (const v of ring) {
        if (v[1] < minY) minY = v[1];
        if (v[1] > maxY) maxY = v[1];
      }
    }
    return maxY - minY;
  }

  expect(verticalExtent(loose)).toBeGreaterThan(verticalExtent(nominal));
});

test("slot center Z keeps the full slot flare inside the body", () => {
  // The slot tip half-height extends above/below SLOT_CENTER_Z_MM. Both
  // extremes must stay inside the body (Z ∈ [0, HINGE_BASE_HEIGHT_MM]) so
  // the cut doesn't poke through the top or bottom face.
  const tip = dovetailTipHalfMm(DOVETAIL_RAIL_LENGTH_MM);
  expect(SLOT_CENTER_Z_MM + tip).toBeLessThan(HINGE_BASE_HEIGHT_MM);
  expect(SLOT_CENTER_Z_MM - tip).toBeGreaterThan(0);
});

test("calibration clearances scale the hinge cavity: loose ≠ tight geometry", () => {
  // A loose calibration widens the internal voids and axial split. Segment
  // counts are constant so the polygon count stays the same — we instead
  // sum every vertex coordinate and assert the totals differ, a crude but
  // reliable smoke test that the calibration input actually reaches the
  // geometry.
  function vertexChecksum(solid: ReturnType<typeof buildHingeBase>) {
    let sum = 0;
    for (const poly of geometries.geom3.toPolygons(solid)) {
      for (const v of poly.vertices) {
        sum += v[0] + v[1] + v[2];
      }
    }
    return sum;
  }

  const tight = buildHingeBase({
    hingeRadialMm: 0.15,
    hingeAxialMm: 0.1,
    dovetailOffsetMm: 0,
  });
  const loose = buildHingeBase({
    hingeRadialMm: 0.5,
    hingeAxialMm: 0.5,
    dovetailOffsetMm: 0,
  });
  expect(geometries.geom3.toPolygons(tight).length).toBeGreaterThan(0);
  expect(geometries.geom3.toPolygons(loose).length).toBeGreaterThan(0);
  expect(vertexChecksum(tight)).not.toBe(vertexChecksum(loose));
});

test("buildHingeBase is callable with zero args (non-parametric signature)", () => {
  // AC: the module exports `buildHingeBase(): Geom3`. Calibration is an
  // optional override of the CLAUDE.md defaults — passing nothing must work.
  expect(() => buildHingeBase()).not.toThrow();
  const solid = buildHingeBase();
  expect(geometries.geom3.toPolygons(solid).length).toBeGreaterThan(0);
});

test("default calibration hinge clearances match CLAUDE.md", () => {
  // Radial 0.3mm / axial 0.2mm per the spec table.
  expect(HINGE_BASE_DEFAULT_CALIBRATION.hingeRadialMm).toBe(0.3);
  expect(HINGE_BASE_DEFAULT_CALIBRATION.hingeAxialMm).toBe(0.2);
});

test("detent bump radius is non-trivial so it registers as a tactile feature", () => {
  expect(DETENT_BUMP_RADIUS_MM).toBeGreaterThan(0.3);
});
