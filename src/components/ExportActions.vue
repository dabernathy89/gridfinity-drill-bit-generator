<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useBitSetStore } from "../stores/bitSet";
import { validateFit } from "../lib/validation";

const store = useBitSetStore();
const { bits, footprint, calibration } = storeToRefs(store);

const fitValidation = computed(() => validateFit(bits.value, footprint.value, calibration.value));

const hasBits = computed(() => bits.value.length > 0);

/**
 * The tray can only be generated when at least one bit is present and the
 * row fits the selected footprint. US-011 will wire the actual STL downloads
 * into these buttons — they are disabled placeholders until then.
 */
const canGenerateTray = computed(() => hasBits.value && fitValidation.value.ok);

/**
 * The hinge base is non-parametric so it is not gated by the bit list. It is
 * still disabled here — US-011 will wire the download.
 */
const trayDisabledReason = computed<string | null>(() => {
  if (!hasBits.value) return "Add at least one bit to generate the tray.";
  if (!fitValidation.value.ok) return fitValidation.value.reason;
  return null;
});
</script>

<template>
  <section class="export-actions" aria-label="Downloads">
    <h3 class="section-title">Downloads</h3>
    <div class="buttons">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!canGenerateTray"
        :title="trayDisabledReason ?? 'Download will be wired up in US-011'"
        data-testid="download-tray"
      >
        Download Tray STL
      </button>
      <button
        type="button"
        class="btn"
        disabled
        title="Download will be wired up in US-011"
        data-testid="download-hinge"
      >
        Download Hinge Base STL
      </button>
    </div>
    <p v-if="trayDisabledReason" class="hint" role="status">
      {{ trayDisabledReason }}
    </p>
  </section>
</template>

<style scoped>
.export-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
}

.section-title {
  margin: 0;
  font-size: 0.95rem;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
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

.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
}
</style>
