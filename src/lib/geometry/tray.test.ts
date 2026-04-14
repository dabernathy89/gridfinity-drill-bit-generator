import { expect, test } from "vite-plus/test";
import { geometries } from "@jscad/modeling";
import { DOVETAIL_ANGLE_DEG, TRAY_HEIGHT_MM, buildTray, layoutHoles, type TrayBit } from "./tray";
import { DOVETAIL_RAIL_LENGTH_MM, dovetailTipHalfMm } from "./dovetail";
import { GRIDFINITY_U_MM, TRAY_DOVETAIL_END_MARGIN_MM, TRAY_WALL_MM } from "../validation";
import { DEFAULT_CALIBRATION } from "../../stores/bitSet";

function makeBits(...sizes: Array<[number, string]>): TrayBit[] {
  return sizes.map(([diameterMm, label]) => ({ diameterMm, label }));
}

const defaultFootprint = { widthU: 2, heightUnits7mm: 6 };
const defaultCalibration = {
  drillHoleToleranceMm: DEFAULT_CALIBRATION.drillHoleToleranceMm,
  dovetailOffsetMm: DEFAULT_CALIBRATION.dovetailOffsetMm,
};

test("buildTray returns a non-empty polygon set for a representative bit list", () => {
  const bits = makeBits([3, "3mm"], [4, "4mm"], [5, "5mm"], [6, "6mm"], [7, "7mm"], [8, "8mm"]);
  const solid = buildTray({
    bits,
    footprint: defaultFootprint,
    calibration: defaultCalibration,
  });
  const polygons = geometries.geom3.toPolygons(solid);
  expect(polygons.length).toBeGreaterThan(0);
});

test("buildTray builds a body-plus-rail even for an empty bit list", () => {
  // US-011 disables the export button on empty bit lists, but buildTray itself
  // must still produce a valid solid so the preview can render the shell.
  const solid = buildTray({
    bits: [],
    footprint: defaultFootprint,
    calibration: defaultCalibration,
  });
  expect(geometries.geom3.toPolygons(solid).length).toBeGreaterThan(0);
});

test("layoutHoles produces a staggered two-row pattern over ⌈N/2⌉ columns", () => {
  // 5 identical bits → 3 columns, row 0 gets indexes 0/2/4, row 1 gets 1/3.
  const bits = makeBits([5, "a"], [5, "b"], [5, "c"], [5, "d"], [5, "e"]);
  const placements = layoutHoles(bits, defaultFootprint, defaultCalibration);
  expect(placements).toHaveLength(5);
  expect(placements.map((p) => p.rowIndex)).toEqual([0, 1, 0, 1, 0]);
  const row0Ys = new Set(placements.filter((p) => p.rowIndex === 0).map((p) => p.centerYmm));
  const row1Ys = new Set(placements.filter((p) => p.rowIndex === 1).map((p) => p.centerYmm));
  // All row-0 bits share one Y; all row-1 bits share another Y; the two Ys differ.
  expect(row0Ys.size).toBe(1);
  expect(row1Ys.size).toBe(1);
  const [y0] = row0Ys;
  const [y1] = row1Ys;
  expect(y0).not.toBe(y1);

  // X pitch = largestHole + wall = 5 + defaultTol + 2. Bits in the same
  // column share an X; stepping to the next column advances X by `pitch`.
  const pitch = 5 + defaultCalibration.drillHoleToleranceMm + TRAY_WALL_MM;
  const xs = placements.map((p) => p.centerXmm);
  expect(xs[1] - xs[0]).toBeCloseTo(0, 6);
  expect(xs[2] - xs[0]).toBeCloseTo(pitch, 6);
  expect(xs[3] - xs[1]).toBeCloseTo(pitch, 6);
  expect(xs[4] - xs[2]).toBeCloseTo(pitch, 6);
});

test("layoutHoles leaves room at the dovetail end and at the near wall", () => {
  const bits = makeBits([5, "a"]);
  const [only] = layoutHoles(bits, { widthU: 1, heightUnits7mm: 3 }, defaultCalibration);
  const largestHole = 5 + defaultCalibration.drillHoleToleranceMm;
  // First hole center = margin + wall + radius.
  const expected = TRAY_DOVETAIL_END_MARGIN_MM + TRAY_WALL_MM + largestHole / 2;
  expect(only.centerXmm).toBeCloseTo(expected, 6);
  // Hole edge must not overlap the dovetail region.
  expect(only.centerXmm - largestHole / 2).toBeGreaterThan(TRAY_DOVETAIL_END_MARGIN_MM);
});

test("layoutHoles uses the largest bit for pitch across both rows", () => {
  // Mixed sizes: the 10mm bit should govern pitch even if most bits are small.
  const bits = makeBits([3, "s"], [10, "L"], [3, "s"], [3, "s"]);
  const placements = layoutHoles(bits, defaultFootprint, defaultCalibration);
  const pitch = 10 + defaultCalibration.drillHoleToleranceMm + TRAY_WALL_MM;
  // column indexes 0/0/1/1 → centers differ by pitch across columns.
  expect(placements[2].centerXmm - placements[0].centerXmm).toBeCloseTo(pitch, 6);
});

test("layoutHoles returns an empty list for an empty bit set", () => {
  expect(layoutHoles([], defaultFootprint, defaultCalibration)).toEqual([]);
});

test("tray footprint X matches widthU × 42mm", () => {
  // Build a tray of known width and inspect the polygon bounding box.
  const widthU = 3;
  const bits = makeBits([5, ""]);
  const solid = buildTray({
    bits,
    footprint: { widthU, heightUnits7mm: 4 },
    calibration: defaultCalibration,
  });
  const polys = geometries.geom3.toPolygons(solid);
  let minX = Infinity;
  let maxX = -Infinity;
  for (const poly of polys) {
    for (const v of poly.vertices) {
      if (v[0] < minX) minX = v[0];
      if (v[0] > maxX) maxX = v[0];
    }
  }
  expect(minX).toBeCloseTo(0, 6);
  expect(maxX).toBeCloseTo(widthU * GRIDFINITY_U_MM, 6);
});

test("tray Z extent is TRAY_HEIGHT_MM", () => {
  const solid = buildTray({
    bits: makeBits([5, ""]),
    footprint: { widthU: 1, heightUnits7mm: 3 },
    calibration: defaultCalibration,
  });
  const polys = geometries.geom3.toPolygons(solid);
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const poly of polys) {
    for (const v of poly.vertices) {
      if (v[2] < minZ) minZ = v[2];
      if (v[2] > maxZ) maxZ = v[2];
    }
  }
  expect(minZ).toBeCloseTo(0, 6);
  expect(maxZ).toBeCloseTo(TRAY_HEIGHT_MM, 6);
});

test("dovetail contract angle is 60°", () => {
  expect(DOVETAIL_ANGLE_DEG).toBe(60);
});

test("dovetail rail tip fits inside the tray height with wall clearance", () => {
  // The rail tip (full Z extent = 2 × dovetailTipHalfMm) must live inside
  // TRAY_HEIGHT_MM centered at Z = TRAY_HEIGHT_MM / 2 with some wall on
  // both sides. CLAUDE.md: ≤45° overhangs; printing orientation assumes
  // the tray prints bit-holes-up so the bottom flank is the overhang.
  const tipFull = 2 * dovetailTipHalfMm(DOVETAIL_RAIL_LENGTH_MM);
  // Expect at least 1 mm of body wall above and below the tip.
  expect(TRAY_HEIGHT_MM - tipFull).toBeGreaterThanOrEqual(2);
});

test("dovetail bottom-flank overhang stays inside the 45° supportless limit", () => {
  // Flank slope dX/dZ must be ≤ 1 (i.e., overhang ≤ 45° from vertical).
  // With the 60°-from-horizontal cutter convention this is tan(30°) ≈ 0.577.
  const rise = dovetailTipHalfMm(DOVETAIL_RAIL_LENGTH_MM) - 1; /* ROOT half = 1 mm */
  const run = DOVETAIL_RAIL_LENGTH_MM;
  const overhangSlope = run / rise; // dX per dZ on the flank
  expect(overhangSlope).toBeLessThanOrEqual(1);
});
