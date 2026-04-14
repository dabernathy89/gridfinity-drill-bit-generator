import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { normalizeDiameterMm, type BitUnit } from "../lib/units";

export interface Bit {
  id: string;
  /** Canonical diameter in millimeters. Imperial input is converted on entry. */
  diameterMm: number;
  /** Preferred display unit for this bit. */
  unit: BitUnit;
  label: string;
}

export interface Footprint {
  /** Gridfinity U (42mm per unit). */
  widthU: number;
  /** Tray height in 7mm increments. */
  heightUnits7mm: number;
}

export interface Calibration {
  /** Male dovetail rail shrink, in millimeters (spec: 0.15–0.20mm). */
  dovetailOffsetMm: number;
  /** Print-in-place hinge radial clearance, in millimeters. */
  hingeRadialMm: number;
  /** Print-in-place hinge axial clearance, in millimeters. */
  hingeAxialMm: number;
  /** Extra diameter added to each drill hole (bit Ø + this). */
  drillHoleToleranceMm: number;
}

/** Spec defaults from CLAUDE.md. User-overridable per-calibration in the UI. */
export const DEFAULT_CALIBRATION: Calibration = {
  dovetailOffsetMm: 0.15,
  hingeRadialMm: 0.3,
  hingeAxialMm: 0.2,
  drillHoleToleranceMm: 0.4,
};

export const DEFAULT_FOOTPRINT: Footprint = {
  widthU: 1,
  heightUnits7mm: 3,
};

export interface BitInput {
  /** Diameter in the specified unit (mm for metric, inches for imperial). */
  diameter: number;
  unit: BitUnit;
  label?: string;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `bit-${idCounter}`;
}

export const useBitSetStore = defineStore("bitSet", () => {
  const setName = ref<string>("");
  const bits = reactive<Bit[]>([]);
  const footprint = reactive<Footprint>({ ...DEFAULT_FOOTPRINT });
  const calibration = reactive<Calibration>({ ...DEFAULT_CALIBRATION });

  function addBit(input: BitInput): Bit {
    const bit: Bit = {
      id: nextId(),
      diameterMm: normalizeDiameterMm(input.diameter, input.unit),
      unit: input.unit,
      label: input.label ?? "",
    };
    bits.push(bit);
    return bit;
  }

  function updateBit(id: string, patch: Partial<BitInput>): void {
    const bit = bits.find((b) => b.id === id);
    if (!bit) return;
    if (patch.label !== undefined) bit.label = patch.label;
    const nextUnit = patch.unit ?? bit.unit;
    if (patch.diameter !== undefined) {
      bit.diameterMm = normalizeDiameterMm(patch.diameter, nextUnit);
    }
    if (patch.unit !== undefined) bit.unit = patch.unit;
  }

  function removeBit(id: string): void {
    const idx = bits.findIndex((b) => b.id === id);
    if (idx >= 0) bits.splice(idx, 1);
  }

  function reorderBits(fromIdx: number, toIdx: number): void {
    if (fromIdx < 0 || fromIdx >= bits.length) return;
    if (toIdx < 0 || toIdx >= bits.length) return;
    const [moved] = bits.splice(fromIdx, 1);
    bits.splice(toIdx, 0, moved);
  }

  function clearBits(): void {
    bits.splice(0, bits.length);
  }

  function resetCalibration(): void {
    Object.assign(calibration, DEFAULT_CALIBRATION);
  }

  return {
    setName,
    bits,
    footprint,
    calibration,
    addBit,
    updateBit,
    removeBit,
    reorderBits,
    clearBits,
    resetCalibration,
  };
});
