import { expect, test } from "vite-plus/test";
import { geometries, measurements } from "@jscad/modeling";
import { buildPreviewSolids, trayOffsetForAssembledView, type PreviewInput } from "./preview";
import { HINGE_BASE_DEPTH_MM, HINGE_BASE_WIDTH_MM } from "./hingeBase";
import { DEFAULT_CALIBRATION } from "../../stores/bitSet";

function makeInput(overrides: Partial<PreviewInput> = {}): PreviewInput {
  return {
    bits: [
      { diameterMm: 3, label: "3mm" },
      { diameterMm: 5, label: "5mm" },
    ],
    footprint: { widthU: 2, heightUnits7mm: 6 },
    calibration: { ...DEFAULT_CALIBRATION },
    ...overrides,
  };
}

test("tray mode returns exactly one solid (the tray)", () => {
  const solids = buildPreviewSolids("tray", makeInput());
  expect(solids).toHaveLength(1);
  expect(geometries.geom3.toPolygons(solids[0]).length).toBeGreaterThan(0);
});

test("hinge mode returns exactly one solid (the hinge base)", () => {
  const solids = buildPreviewSolids("hinge", makeInput());
  expect(solids).toHaveLength(1);
  // Hinge base occupies the 42×42 footprint (barrel protrudes -Y).
  const [min, max] = measurements.measureBoundingBox(solids[0]);
  expect(max[0] - min[0]).toBeCloseTo(HINGE_BASE_WIDTH_MM, 3);
});

test("both mode returns the tray AND the hinge base as distinct solids", () => {
  const solids = buildPreviewSolids("both", makeInput());
  expect(solids).toHaveLength(2);
  for (const s of solids) {
    expect(geometries.geom3.toPolygons(s).length).toBeGreaterThan(0);
  }
});

test("both mode places the tray on the +X side of the hinge base (no overlap in X)", () => {
  // Preview composition is a translation, not a Boolean — so we verify the
  // tray's X bounding box starts at exactly HINGE_BASE_WIDTH_MM (flush with
  // the hinge base's +X face).
  const input = makeInput();
  const solids = buildPreviewSolids("both", input);
  // First solid is the tray (see buildPreviewSolids), second is the hinge base.
  const trayBox = measurements.measureBoundingBox(solids[0]);
  const hingeBox = measurements.measureBoundingBox(solids[1]);
  expect(trayBox[0][0]).toBeCloseTo(HINGE_BASE_WIDTH_MM, 3);
  expect(hingeBox[1][0]).toBeCloseTo(HINGE_BASE_WIDTH_MM, 3);
});

test("trayOffsetForAssembledView aligns +Y edges when hinge is deeper than tray", () => {
  // 6×7mm = 42mm tray depth == 42mm hinge depth → zero Y offset.
  const off = trayOffsetForAssembledView(HINGE_BASE_DEPTH_MM);
  expect(off[0]).toBeCloseTo(HINGE_BASE_WIDTH_MM, 6);
  expect(off[1]).toBeCloseTo(0, 6);
  expect(off[2]).toBeCloseTo(0, 6);
});

test("trayOffsetForAssembledView shifts a shallower tray forward so its back edge meets the hinge base", () => {
  const shallow = HINGE_BASE_DEPTH_MM - 14; // 28mm tray
  const off = trayOffsetForAssembledView(shallow);
  // A 28mm tray against a 42mm hinge should have its back edge pushed in by 14mm.
  expect(off[1]).toBeCloseTo(14, 6);
});

test("buildPreviewSolids still produces a renderable solid when the bit list is empty", () => {
  // US-011 disables the STL export on empty lists, but the preview panel
  // should still show the tray shell (and the hinge base) so users see the
  // footprint before they add bits.
  const solids = buildPreviewSolids("both", makeInput({ bits: [] }));
  expect(solids).toHaveLength(2);
  for (const s of solids) {
    expect(geometries.geom3.toPolygons(s).length).toBeGreaterThan(0);
  }
});
