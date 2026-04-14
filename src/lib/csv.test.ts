import { expect, test } from "vite-plus/test";
import { formatBitsCsv, parseBitCsv } from "./csv";
import { normalizeDiameterMm } from "./units";
import type { Bit } from "../stores/bitSet";

test("parseBitCsv accepts a document with a header row", () => {
  const csv = ["diameter,unit,label", "5.5,metric,5.5 mm", "0.25,imperial,1/4 wood"].join("\n");
  const { rows, errors } = parseBitCsv(csv);
  expect(errors).toEqual([]);
  expect(rows).toEqual([
    { diameter: 5.5, unit: "metric", label: "5.5 mm" },
    { diameter: 0.25, unit: "imperial", label: "1/4 wood" },
  ]);
});

test("parseBitCsv accepts a document without a header row", () => {
  const csv = "3.175,metric,\n1/4,imperial,quarter";
  const { rows, errors } = parseBitCsv(csv);
  expect(errors).toEqual([]);
  expect(rows).toEqual([
    { diameter: 3.175, unit: "metric", label: "" },
    { diameter: 0.25, unit: "imperial", label: "quarter" },
  ]);
});

test("parseBitCsv tolerates mixed units and imperial fractions", () => {
  const csv = ["1/4,imperial,a", "1 1/2,imperial,b", "6.35,metric,c", '0.25",imperial,d'].join(
    "\n",
  );
  const { rows, errors } = parseBitCsv(csv);
  expect(errors).toEqual([]);
  expect(rows.map((r) => r.diameter)).toEqual([0.25, 1.5, 6.35, 0.25]);
  expect(rows.map((r) => r.unit)).toEqual(["imperial", "imperial", "metric", "imperial"]);
});

test("parseBitCsv reports per-row errors without discarding valid rows", () => {
  const csv = [
    "diameter,unit,label",
    "5,metric,good",
    "abc,metric,bad-diameter",
    "1/4,frobnicate,bad-unit",
    "",
    "only-one-column",
    "3.175,metric,also-good",
  ].join("\n");
  const { rows, errors } = parseBitCsv(csv);
  expect(rows).toEqual([
    { diameter: 5, unit: "metric", label: "good" },
    { diameter: 3.175, unit: "metric", label: "also-good" },
  ]);
  expect(errors.map((e) => e.line)).toEqual([3, 4, 6]);
  for (const err of errors) {
    expect(err.message.length).toBeGreaterThan(0);
  }
});

test("parseBitCsv skips blank lines", () => {
  const csv = "\n\n5,metric,a\n\n6,metric,b\n\n";
  const { rows, errors } = parseBitCsv(csv);
  expect(errors).toEqual([]);
  expect(rows).toEqual([
    { diameter: 5, unit: "metric", label: "a" },
    { diameter: 6, unit: "metric", label: "b" },
  ]);
});

test("parseBitCsv handles CRLF line endings", () => {
  const csv = "diameter,unit,label\r\n5,metric,a\r\n6,metric,b\r\n";
  const { rows, errors } = parseBitCsv(csv);
  expect(errors).toEqual([]);
  expect(rows.map((r) => r.diameter)).toEqual([5, 6]);
});

test("parseBitCsv handles quoted labels with commas and doubled quotes", () => {
  const csv = ["diameter,unit,label", '5,metric,"wood, general"', '6,metric,"he said ""hi"""'].join(
    "\n",
  );
  const { rows, errors } = parseBitCsv(csv);
  expect(errors).toEqual([]);
  expect(rows[0]?.label).toBe("wood, general");
  expect(rows[1]?.label).toBe('he said "hi"');
});

test("formatBitsCsv writes a header and round-trips through parseBitCsv", () => {
  const bits: Pick<Bit, "diameterMm" | "unit" | "label">[] = [
    { diameterMm: 5.5, unit: "metric", label: "5.5 mm" },
    { diameterMm: 6.35, unit: "imperial", label: "1/4" },
    { diameterMm: 3.175, unit: "metric", label: "" },
    { diameterMm: 12.7, unit: "imperial", label: "carpenter's favorite, 1/2" },
  ];
  const csv = formatBitsCsv(bits);
  expect(csv.startsWith("diameter,unit,label\n")).toBe(true);

  const { rows, errors } = parseBitCsv(csv);
  expect(errors).toEqual([]);
  expect(rows).toHaveLength(bits.length);

  for (let i = 0; i < bits.length; i += 1) {
    const original = bits[i];
    const reimported = rows[i];
    expect(reimported).toBeDefined();
    if (!reimported || !original) continue;
    expect(reimported.unit).toBe(original.unit);
    expect(reimported.label).toBe(original.label);
    // After normalizing the re-imported (unit-native) diameter back to mm,
    // the canonical diameter should match exactly.
    expect(normalizeDiameterMm(reimported.diameter, reimported.unit)).toBe(original.diameterMm);
  }
});
