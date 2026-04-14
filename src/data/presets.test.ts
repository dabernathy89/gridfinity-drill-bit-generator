import { expect, test } from "vite-plus/test";
import { PRESETS, findPreset } from "./presets";
import { normalizeDiameterMm } from "../lib/units";

test("PRESETS contains the three documented built-in packs", () => {
  const ids = PRESETS.map((p) => p.id);
  expect(ids).toContain("metric-1-13");
  expect(ids).toContain("fractional-imperial-16-2");
  expect(ids).toContain("number-drills-1-60");
  expect(PRESETS.length).toBeGreaterThanOrEqual(3);
});

test("every preset has a stable id, name, and non-empty bit list", () => {
  const seen = new Set<string>();
  for (const preset of PRESETS) {
    expect(preset.id).not.toBe("");
    expect(preset.name).not.toBe("");
    expect(preset.bits.length).toBeGreaterThan(0);
    expect(seen.has(preset.id)).toBe(false);
    seen.add(preset.id);
  }
});

test("every preset bit normalizes to a positive canonical mm value", () => {
  for (const preset of PRESETS) {
    for (const bit of preset.bits) {
      const mm = normalizeDiameterMm(bit.diameter, bit.unit);
      expect(Number.isFinite(mm)).toBe(true);
      expect(mm).toBeGreaterThan(0);
    }
  }
});

test("metric preset covers 1.0mm through 13.0mm in 0.5mm steps", () => {
  const preset = findPreset("metric-1-13");
  expect(preset).toBeDefined();
  if (!preset) return;
  expect(preset.bits.length).toBe(25);
  expect(preset.bits[0]?.diameter).toBe(1.0);
  expect(preset.bits.at(-1)?.diameter).toBe(13.0);
});

test('fractional imperial preset spans 1/16" through 1/2" in 1/32" steps', () => {
  const preset = findPreset("fractional-imperial-16-2");
  expect(preset).toBeDefined();
  if (!preset) return;
  expect(preset.bits.length).toBe(15);
  expect(preset.bits[0]?.diameter).toBeCloseTo(1 / 16, 10);
  expect(preset.bits[0]?.label).toBe("1/16");
  expect(preset.bits.at(-1)?.diameter).toBeCloseTo(1 / 2, 10);
  expect(preset.bits.at(-1)?.label).toBe("1/2");
});

test("number drill preset has 60 sizes labeled #1–#60 in descending diameter", () => {
  const preset = findPreset("number-drills-1-60");
  expect(preset).toBeDefined();
  if (!preset) return;
  expect(preset.bits.length).toBe(60);
  expect(preset.bits[0]?.label).toBe("#1");
  expect(preset.bits[0]?.diameter).toBeCloseTo(0.228, 4);
  expect(preset.bits.at(-1)?.label).toBe("#60");
  expect(preset.bits.at(-1)?.diameter).toBeCloseTo(0.04, 4);
  // Diameters monotonically decrease.
  for (let i = 1; i < preset.bits.length; i += 1) {
    const prev = preset.bits[i - 1]!.diameter;
    const cur = preset.bits[i]!.diameter;
    expect(cur).toBeLessThan(prev);
  }
});

test("findPreset returns undefined for unknown ids", () => {
  expect(findPreset("does-not-exist")).toBeUndefined();
});
