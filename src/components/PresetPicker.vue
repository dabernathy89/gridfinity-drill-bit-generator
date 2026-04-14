<script setup lang="ts">
import { computed, ref } from "vue";
import { useBitSetStore } from "../stores/bitSet";
import { PRESETS, findPreset } from "../data/presets";

const store = useBitSetStore();

const selectedId = ref<string>(PRESETS[0]?.id ?? "");

const selected = computed(() => findPreset(selectedId.value));

function loadPreset(mode: "replace" | "append"): void {
  const preset = selected.value;
  if (!preset) return;
  if (mode === "replace") store.clearBits();
  for (const bit of preset.bits) {
    store.addBit({
      diameter: bit.diameter,
      unit: bit.unit,
      label: bit.label,
    });
  }
}
</script>

<template>
  <section class="preset-picker" aria-label="Preset bit packs">
    <div class="preset-row">
      <label class="field preset-select-field">
        <span class="field-label">Preset</span>
        <select v-model="selectedId" class="input">
          <option v-for="preset in PRESETS" :key="preset.id" :value="preset.id">
            {{ preset.name }}
          </option>
        </select>
      </label>
      <div class="preset-actions">
        <button
          type="button"
          class="btn"
          :disabled="!selected || store.bits.length === 0"
          @click="loadPreset('append')"
        >
          Append
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!selected"
          @click="loadPreset('replace')"
        >
          {{ store.bits.length === 0 ? "Load" : "Replace" }}
        </button>
      </div>
    </div>
    <p v-if="selected" class="preset-description">
      {{ selected.description }}
      <span class="preset-count">({{ selected.bits.length }} bits)</span>
    </p>
  </section>
</template>

<style scoped>
.preset-picker {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
}

.preset-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
  align-items: end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-label {
  font-size: 0.8rem;
  color: var(--muted);
}

.input {
  font: inherit;
  color: inherit;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.4rem 0.55rem;
}

.preset-actions {
  display: inline-flex;
  gap: 0.3rem;
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

.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.preset-description {
  color: var(--muted);
  font-size: 0.85rem;
  margin: 0;
}

.preset-count {
  font-variant-numeric: tabular-nums;
}

@media (max-width: 600px) {
  .preset-row {
    grid-template-columns: 1fr;
  }
  .preset-actions {
    justify-content: flex-end;
  }
}
</style>
