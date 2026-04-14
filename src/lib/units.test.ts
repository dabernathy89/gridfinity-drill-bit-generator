import { expect, test } from "vite-plus/test";
import { inchesFromMm, mmFromInches, normalizeDiameterMm, parseDiameter, toDisplay } from "./units";

test("mm↔inch round-trip is exact for common sizes", () => {
  expect(mmFromInches(1)).toBe(25.4);
  expect(inchesFromMm(25.4)).toBe(1);
  expect(mmFromInches(0.25)).toBe(6.35);
});

test("normalizeDiameterMm leaves metric values alone and converts imperial", () => {
  expect(normalizeDiameterMm(5.5, "metric")).toBe(5.5);
  expect(normalizeDiameterMm(0.25, "imperial")).toBe(6.35);
});

test("toDisplay formats metric with units and trimmed zeros", () => {
  expect(toDisplay(5, "metric")).toBe("5 mm");
  expect(toDisplay(5.5, "metric")).toBe("5.5 mm");
  expect(toDisplay(3.175, "metric")).toBe("3.175 mm");
});

test("parseDiameter accepts decimals for metric", () => {
  expect(parseDiameter("5.5", "metric")).toEqual({ ok: true, value: 5.5 });
  expect(parseDiameter("  12 ", "metric")).toEqual({ ok: true, value: 12 });
});

test("parseDiameter rejects non-numeric and non-positive metric input", () => {
  const bad = parseDiameter("abc", "metric");
  expect(bad.ok).toBe(false);
  const zero = parseDiameter("0", "metric");
  expect(zero.ok).toBe(false);
  const neg = parseDiameter("-1", "metric");
  expect(neg.ok).toBe(false);
});

test("parseDiameter accepts fractions and mixed numbers for imperial", () => {
  expect(parseDiameter("1/4", "imperial")).toEqual({ ok: true, value: 0.25 });
  expect(parseDiameter("3/8", "imperial")).toEqual({ ok: true, value: 0.375 });
  expect(parseDiameter("1 1/2", "imperial")).toEqual({ ok: true, value: 1.5 });
  expect(parseDiameter("0.25", "imperial")).toEqual({ ok: true, value: 0.25 });
  // Trailing inch mark tolerated.
  expect(parseDiameter('1/4"', "imperial")).toEqual({ ok: true, value: 0.25 });
});

test("parseDiameter rejects imperial garbage and zero denominators", () => {
  expect(parseDiameter("1/0", "imperial").ok).toBe(false);
  expect(parseDiameter("1/4/8", "imperial").ok).toBe(false);
  expect(parseDiameter("", "imperial").ok).toBe(false);
});

test("toDisplay snaps metric diameters to the nearest inch fraction", () => {
  // 6.35 mm = 1/4"
  expect(toDisplay(6.35, "imperial")).toBe('1/4"');
  // 9.525 mm = 3/8"
  expect(toDisplay(9.525, "imperial")).toBe('3/8"');
  // 1.5875 mm = 1/16"
  expect(toDisplay(1.5875, "imperial")).toBe('1/16"');
  // 25.4 mm = 1"
  expect(toDisplay(25.4, "imperial")).toBe('1"');
  // 28.575 mm = 1 1/8"
  expect(toDisplay(28.575, "imperial")).toBe('1 1/8"');
});
