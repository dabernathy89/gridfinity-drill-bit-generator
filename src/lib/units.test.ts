import { expect, test } from "vite-plus/test";
import { inchesFromMm, mmFromInches, normalizeDiameterMm, toDisplay } from "./units";

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
