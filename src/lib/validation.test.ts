import { expect, test } from "vite-plus/test";
import {
  GRIDFINITY_U_MM,
  TRAY_DOVETAIL_END_MARGIN_MM,
  TRAY_WALL_MM,
  estimateTrayRowLengthMm,
  minWidthUForBits,
  validateFit,
} from "./validation";
import { DEFAULT_CALIBRATION } from "../stores/bitSet";

const defaultTol = DEFAULT_CALIBRATION.drillHoleToleranceMm;

function bits(...diameters: number[]) {
  return diameters.map((d, i) => ({ id: `b${i}`, diameterMm: d }));
}

test("estimateTrayRowLengthMm is zero for an empty list", () => {
  expect(estimateTrayRowLengthMm([], defaultTol)).toBe(0);
});

test("estimateTrayRowLengthMm uses the largest hole for pitch across both rows", () => {
  // Two bits → 1 column (staggered: row A + row B share one column slot).
  // Pitch = max(diameter) + tolerance + wall.
  // Total = 1 * pitch + end wall + dovetail margin.
  const length = estimateTrayRowLengthMm(bits(3, 10), defaultTol);
  const largestHole = 10 + defaultTol;
  const expected = 1 * (largestHole + TRAY_WALL_MM) + TRAY_WALL_MM + TRAY_DOVETAIL_END_MARGIN_MM;
  expect(length).toBeCloseTo(expected, 6);
});

test("estimateTrayRowLengthMm scales by ⌈N / 2⌉ columns", () => {
  // 5 bits → ⌈5/2⌉ = 3 columns.
  const length = estimateTrayRowLengthMm(bits(5, 5, 5, 5, 5), defaultTol);
  const pitch = 5 + defaultTol + TRAY_WALL_MM;
  const expected = 3 * pitch + TRAY_WALL_MM + TRAY_DOVETAIL_END_MARGIN_MM;
  expect(length).toBeCloseTo(expected, 6);
});

test("validateFit returns ok:true for an empty bit list", () => {
  const result = validateFit([], { widthU: 1 }, { drillHoleToleranceMm: defaultTol });
  expect(result).toEqual({ ok: true });
});

test("validateFit returns ok:true when the row fits comfortably", () => {
  // A single 3mm bit is trivially under 1U (42 mm).
  const result = validateFit(bits(3), { widthU: 1 }, { drillHoleToleranceMm: defaultTol });
  expect(result).toEqual({ ok: true });
});

test("validateFit returns ok:true for a single bit at an edge-case tolerance", () => {
  // 1 bit @ 10mm + 0.4 tol → 1 col. pitch 12.4. total ≈ 18.4 mm ≪ 42 mm.
  const result = validateFit(bits(10), { widthU: 1 }, { drillHoleToleranceMm: defaultTol });
  expect(result.ok).toBe(true);
});

test("validateFit blocks when the bit row exceeds the selected U-width", () => {
  // 14 × 10mm bits → 7 columns × (10 + 0.4 + 2) = 86.8 + 2 + 4 = 92.8 mm > 2U (84 mm).
  const many = bits(10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10);
  const result = validateFit(many, { widthU: 2 }, { drillHoleToleranceMm: defaultTol });
  if (result.ok) throw new Error("expected overflow failure");
  expect(result.minWidthU).toBeGreaterThan(2);
  expect(result.reason).toMatch(/U/);
});

test("validateFit reports minWidthU that the caller can apply to the input to pass", () => {
  // Build a list that clearly overflows 1U and check that minWidthU passes.
  const many = bits(8, 8, 8, 8, 8, 8, 8, 8, 8, 8); // 10 × 8 mm bits → 5 cols
  const result = validateFit(many, { widthU: 1 }, { drillHoleToleranceMm: defaultTol });
  if (result.ok) throw new Error("expected overflow failure for 10 × 8 mm bits @ 1U");

  const retry = validateFit(
    many,
    { widthU: result.minWidthU },
    { drillHoleToleranceMm: defaultTol },
  );
  expect(retry.ok).toBe(true);
});

test("minWidthUForBits is always ≥ 1 even for trivial lists", () => {
  expect(minWidthUForBits([], defaultTol)).toBe(1);
  expect(minWidthUForBits(bits(1), defaultTol)).toBe(1);
});

test("minWidthUForBits scales monotonically with bit count at fixed diameter", () => {
  const sixes = (n: number) => Array.from({ length: n }, () => 6);
  const a = minWidthUForBits(bits(...sixes(10)), defaultTol);
  const b = minWidthUForBits(bits(...sixes(30)), defaultTol);
  const c = minWidthUForBits(bits(...sixes(60)), defaultTol);
  expect(a).toBeLessThanOrEqual(b);
  expect(b).toBeLessThanOrEqual(c);
});

test("a drill-hole tolerance increase can tip a borderline list into overflow", () => {
  // Construct a list that fits at tolerance 0 but overflows at a large tolerance.
  // 4 columns × (10 + tol + 2) + 2 + 4 = 4·(12 + tol) + 6 = 54 + 4·tol
  // widthU = 2 → 84 mm. Tight case: tol = 0 → 54 mm (fits); tol = 8 → 86 mm (overflows).
  const list = bits(10, 10, 10, 10, 10, 10, 10); // 7 bits → 4 cols
  const okResult = validateFit(list, { widthU: 2 }, { drillHoleToleranceMm: 0 });
  expect(okResult.ok).toBe(true);

  const failResult = validateFit(list, { widthU: 2 }, { drillHoleToleranceMm: 8 });
  if (failResult.ok) throw new Error("expected overflow at high tolerance");
  expect(failResult.minWidthU).toBeGreaterThanOrEqual(3);
});

test("GRIDFINITY_U_MM equals the 42 mm Gridfinity spec", () => {
  expect(GRIDFINITY_U_MM).toBe(42);
});

test("validateFit accepts a long row that still fits at the max 6U footprint", () => {
  // 40 × 6mm bits → 20 columns × (6 + 0.4 + 2) = 168 + 2 + 4 = 174 mm ≤ 6U (252 mm).
  const many = bits(...Array.from({ length: 40 }, () => 6));
  const result = validateFit(many, { widthU: 6 }, { drillHoleToleranceMm: defaultTol });
  expect(result).toEqual({ ok: true });
});

test("validateFit rejects a row that overflows even at the max 6U footprint", () => {
  // 60 × 10mm bits → 30 cols × (10 + 0.4 + 2) = 372 + 6 = 378 mm > 6U (252 mm).
  const tooMany = bits(...Array.from({ length: 60 }, () => 10));
  const result = validateFit(tooMany, { widthU: 6 }, { drillHoleToleranceMm: defaultTol });
  if (result.ok) throw new Error("expected overflow at 6U");
  expect(result.minWidthU).toBeGreaterThan(6);
  expect(result.reason).toMatch(/6 U/);
});
