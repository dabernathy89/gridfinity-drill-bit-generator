/**
 * Built-in drill-bit presets.
 *
 * Presets are defined in their author-natural unit (mm for metric sets,
 * decimal inches for imperial) and passed straight into `store.addBit`,
 * which normalizes imperial values to canonical millimeters on entry. This
 * keeps each preset readable alongside the physical index it represents.
 */

import type { BitUnit } from "../lib/units";

export interface PresetBit {
  /** Diameter in the preset's native unit (mm for metric, inches for imperial). */
  diameter: number;
  unit: BitUnit;
  label: string;
}

export interface Preset {
  /** Stable machine-readable identifier. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** One-line description shown next to the name in the picker. */
  description: string;
  bits: readonly PresetBit[];
}

// --- Metric 1–13mm (0.5mm steps) ------------------------------------------

function buildMetricIndex(): readonly PresetBit[] {
  const out: PresetBit[] = [];
  // 0.5mm increments from 1.0mm through 13.0mm inclusive — 25 sizes.
  for (let halfMm = 2; halfMm <= 26; halfMm += 1) {
    const diameter = halfMm / 2;
    const label = `${Math.round(diameter * 10) / 10}`;
    out.push({ diameter, unit: "metric", label });
  }
  return out;
}

// --- Fractional imperial 1/16"–1/2" (1/32" steps) -------------------------

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

function buildFractionalImperial(): readonly PresetBit[] {
  const out: PresetBit[] = [];
  // 1/32" increments from 2/32 (=1/16") through 16/32 (=1/2") inclusive.
  for (let thirtySeconds = 2; thirtySeconds <= 16; thirtySeconds += 1) {
    const g = gcd(thirtySeconds, 32);
    const num = thirtySeconds / g;
    const den = 32 / g;
    out.push({
      diameter: thirtySeconds / 32,
      unit: "imperial",
      label: `${num}/${den}`,
    });
  }
  return out;
}

// --- Number drills #1–#60 -------------------------------------------------

/**
 * Standard US number-gauge drill sizes in decimal inches.
 * Source: ANSI/ASME B94.11M standard wire-gauge drill table.
 * Index 0 of the array corresponds to #1; index 59 to #60.
 */
const NUMBER_DRILL_INCHES: readonly number[] = [
  0.228, 0.221, 0.213, 0.209, 0.2055, 0.204, 0.201, 0.199, 0.196, 0.1935, 0.191, 0.189, 0.185,
  0.182, 0.18, 0.177, 0.173, 0.1695, 0.166, 0.161, 0.159, 0.157, 0.154, 0.152, 0.1495, 0.147, 0.144,
  0.1405, 0.136, 0.1285, 0.12, 0.116, 0.113, 0.111, 0.11, 0.1065, 0.104, 0.1015, 0.0995, 0.098,
  0.096, 0.0935, 0.089, 0.086, 0.082, 0.081, 0.0785, 0.076, 0.073, 0.07, 0.067, 0.0635, 0.0595,
  0.055, 0.052, 0.0465, 0.043, 0.042, 0.041, 0.04,
];

function buildNumberDrills(): readonly PresetBit[] {
  return NUMBER_DRILL_INCHES.map((diameter, idx) => ({
    diameter,
    unit: "imperial" as const,
    label: `#${idx + 1}`,
  }));
}

export const PRESETS: readonly Preset[] = [
  {
    id: "metric-1-13",
    name: "Metric 1–13mm (0.5mm steps)",
    description: "25 metric sizes, 1.0mm–13.0mm.",
    bits: buildMetricIndex(),
  },
  {
    id: "fractional-imperial-16-2",
    name: "Fractional Imperial 1/16–1/2 (1/32 steps)",
    description: '15 fractional-inch sizes, 1/16" – 1/2".',
    bits: buildFractionalImperial(),
  },
  {
    id: "number-drills-1-60",
    name: "Number drills #1–#60",
    description: '60 US number-gauge sizes, #1 (0.228") – #60 (0.040").',
    bits: buildNumberDrills(),
  },
];

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
