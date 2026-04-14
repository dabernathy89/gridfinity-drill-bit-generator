<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useBitSetStore, DEFAULT_CALIBRATION } from "../stores/bitSet";
import { validateFit } from "../lib/validation";

const store = useBitSetStore();
const { bits, footprint, calibration } = storeToRefs(store);

const fitValidation = computed(() => validateFit(bits.value, footprint.value, calibration.value));

const MIN_WIDTH_U = 1;
const MAX_WIDTH_U = 6;
const MIN_HEIGHT_UNITS = 2;

function clampInt(raw: unknown, min: number, max?: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return min;
  const truncated = Math.trunc(n);
  const lowered = truncated < min ? min : truncated;
  return max !== undefined && lowered > max ? max : lowered;
}

function clampFloat(raw: unknown, min: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return min;
  return n < min ? min : n;
}

function onWidthInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  footprint.value.widthU = clampInt(target.value, MIN_WIDTH_U, MAX_WIDTH_U);
  target.value = String(footprint.value.widthU);
}

function onHeightInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  footprint.value.heightUnits7mm = clampInt(target.value, MIN_HEIGHT_UNITS);
  target.value = String(footprint.value.heightUnits7mm);
}

function onCalibrationInput(event: Event, key: keyof typeof calibration.value): void {
  const target = event.target as HTMLInputElement;
  calibration.value[key] = clampFloat(target.value, 0);
}

const widthMm = computed(() => footprint.value.widthU * 42);
const heightMm = computed(() => footprint.value.heightUnits7mm * 7);

const isCalibrationDirty = computed(
  () =>
    calibration.value.dovetailOffsetMm !== DEFAULT_CALIBRATION.dovetailOffsetMm ||
    calibration.value.hingeRadialMm !== DEFAULT_CALIBRATION.hingeRadialMm ||
    calibration.value.hingeAxialMm !== DEFAULT_CALIBRATION.hingeAxialMm ||
    calibration.value.drillHoleToleranceMm !== DEFAULT_CALIBRATION.drillHoleToleranceMm,
);
</script>

<template>
  <section class="footprint-calibration" aria-label="Footprint and calibration">
    <h3 class="section-title">Footprint</h3>

    <div class="footprint-grid">
      <label class="field">
        <span class="field-label">
          Width
          <span class="hint">Gridfinity U (42 mm each)</span>
        </span>
        <input
          class="input"
          type="number"
          inputmode="numeric"
          :min="MIN_WIDTH_U"
          :max="MAX_WIDTH_U"
          step="1"
          :value="footprint.widthU"
          @input="onWidthInput"
        />
        <span class="derived">= {{ widthMm }} mm</span>
      </label>

      <label class="field">
        <span class="field-label">
          Height
          <span class="hint">7 mm units</span>
        </span>
        <input
          class="input"
          type="number"
          inputmode="numeric"
          :min="MIN_HEIGHT_UNITS"
          step="1"
          :value="footprint.heightUnits7mm"
          @input="onHeightInput"
        />
        <span class="derived">= {{ heightMm }} mm</span>
      </label>
    </div>

    <p
      v-if="!fitValidation.ok"
      class="fit-error"
      role="alert"
      aria-live="polite"
      data-testid="fit-error"
    >
      <strong>Width too narrow.</strong>
      {{ fitValidation.reason }}
      Increase width to at least
      <strong>{{ fitValidation.minWidthU }} U</strong>
      or remove bits.
    </p>

    <details class="calibration">
      <summary class="calibration-summary">
        <span>Calibration</span>
        <span v-if="isCalibrationDirty" class="calibration-dirty" aria-label="Modified">
          modified
        </span>
      </summary>

      <p class="calibration-help">
        Fine-tune tolerances to your filament and printer. Defaults match PLA on a well-calibrated
        machine.
      </p>

      <div class="calibration-grid">
        <label class="field">
          <span class="field-label">
            Dovetail offset
            <span class="hint">mm (default {{ DEFAULT_CALIBRATION.dovetailOffsetMm }})</span>
          </span>
          <input
            class="input"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.01"
            :value="calibration.dovetailOffsetMm"
            @input="(e) => onCalibrationInput(e, 'dovetailOffsetMm')"
          />
        </label>

        <label class="field">
          <span class="field-label">
            Hinge radial clearance
            <span class="hint">mm (default {{ DEFAULT_CALIBRATION.hingeRadialMm }})</span>
          </span>
          <input
            class="input"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.05"
            :value="calibration.hingeRadialMm"
            @input="(e) => onCalibrationInput(e, 'hingeRadialMm')"
          />
        </label>

        <label class="field">
          <span class="field-label">
            Hinge axial clearance
            <span class="hint">mm (default {{ DEFAULT_CALIBRATION.hingeAxialMm }})</span>
          </span>
          <input
            class="input"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.05"
            :value="calibration.hingeAxialMm"
            @input="(e) => onCalibrationInput(e, 'hingeAxialMm')"
          />
        </label>

        <label class="field">
          <span class="field-label">
            Drill-hole tolerance
            <span class="hint">mm (default {{ DEFAULT_CALIBRATION.drillHoleToleranceMm }})</span>
          </span>
          <input
            class="input"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.05"
            :value="calibration.drillHoleToleranceMm"
            @input="(e) => onCalibrationInput(e, 'drillHoleToleranceMm')"
          />
        </label>
      </div>

      <div class="calibration-actions">
        <button
          type="button"
          class="btn"
          :disabled="!isCalibrationDirty"
          @click="store.resetCalibration()"
        >
          Reset to defaults
        </button>
      </div>
    </details>
  </section>
</template>

<style scoped>
.footprint-calibration {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
}

.section-title {
  margin: 0;
  font-size: 0.95rem;
}

.footprint-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-label {
  font-size: 0.8rem;
  color: var(--muted);
  display: inline-flex;
  gap: 0.4rem;
  align-items: baseline;
  flex-wrap: wrap;
}

.hint {
  font-weight: normal;
  color: var(--muted);
  font-size: 0.75rem;
}

.derived {
  font-size: 0.75rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.fit-error {
  margin: 0;
  padding: 0.5rem 0.6rem;
  border: 1px solid #d14343;
  border-radius: 4px;
  background: rgba(209, 67, 67, 0.08);
  color: #d14343;
  font-size: 0.85rem;
  line-height: 1.4;
}

.fit-error strong {
  color: inherit;
}

.input {
  font: inherit;
  color: inherit;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.4rem 0.55rem;
  width: 100%;
}

.calibration {
  border-top: 1px dashed var(--border);
  padding-top: 0.75rem;
}

.calibration-summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-h);
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
  list-style: revert;
}

.calibration-dirty {
  font-size: 0.75rem;
  font-weight: normal;
  color: var(--accent);
}

.calibration-help {
  color: var(--muted);
  font-size: 0.85rem;
  margin: 0.5rem 0 0.75rem;
}

.calibration-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 0.75rem;
}

.calibration-actions {
  margin-top: 0.75rem;
  display: flex;
  justify-content: flex-end;
}

.btn {
  font: inherit;
  color: inherit;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .footprint-grid,
  .calibration-grid {
    grid-template-columns: 1fr;
  }
}
</style>
