<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useBitSetStore } from "../stores/bitSet";
import { validateFit } from "../lib/validation";
import {
  HINGE_BASE_STL_FILENAME,
  buildHingeBaseStlBlob,
  buildTrayStlBlob,
  trayStlFilename,
  triggerBlobDownload,
} from "../lib/geometry/stlExport";

const store = useBitSetStore();
const { bits, footprint, calibration, setName } = storeToRefs(store);

const fitValidation = computed(() => validateFit(bits.value, footprint.value, calibration.value));

const hasBits = computed(() => bits.value.length > 0);

/**
 * The tray can only be generated when at least one bit is present and the
 * row fits the selected footprint. Per the AC: "Export buttons disabled
 * while validation fails".
 */
const canGenerateTray = computed(() => hasBits.value && fitValidation.value.ok);

const trayDisabledReason = computed<string | null>(() => {
  if (!hasBits.value) return "Add at least one bit to generate the tray.";
  if (!fitValidation.value.ok) return fitValidation.value.reason;
  return null;
});

/**
 * Generation can take a moment for long bit lists — disable the buttons
 * while the JSCAD CSG + STL serialization runs so the user doesn't
 * double-click and queue a second export.
 */
const isExporting = ref(false);
const exportError = ref<string | null>(null);

function messageFromError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function downloadTray(): Promise<void> {
  if (!canGenerateTray.value || isExporting.value) return;
  isExporting.value = true;
  exportError.value = null;
  try {
    // Yield a frame so the "Exporting…" state paints before the synchronous
    // CSG work pegs the main thread.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
    const blob = buildTrayStlBlob({
      bits: bits.value,
      footprint: footprint.value,
      calibration: {
        drillHoleToleranceMm: calibration.value.drillHoleToleranceMm,
        dovetailOffsetMm: calibration.value.dovetailOffsetMm,
      },
    });
    triggerBlobDownload(blob, trayStlFilename(setName.value));
  } catch (err) {
    exportError.value = messageFromError(err);
  } finally {
    isExporting.value = false;
  }
}

async function downloadHingeBase(): Promise<void> {
  if (isExporting.value) return;
  isExporting.value = true;
  exportError.value = null;
  try {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
    const blob = buildHingeBaseStlBlob({
      hingeRadialMm: calibration.value.hingeRadialMm,
      hingeAxialMm: calibration.value.hingeAxialMm,
      // Female slot nominally uses no offset — the male rail carries the
      // spec shrink. `preview.ts` uses the same convention so the previewed
      // mesh matches the exported STL.
      dovetailOffsetMm: 0,
    });
    triggerBlobDownload(blob, HINGE_BASE_STL_FILENAME);
  } catch (err) {
    exportError.value = messageFromError(err);
  } finally {
    isExporting.value = false;
  }
}
</script>

<template>
  <section class="export-actions" aria-label="Downloads">
    <h3 class="section-title">Downloads</h3>
    <div class="buttons">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!canGenerateTray || isExporting"
        :title="trayDisabledReason ?? 'Download the parametric tray as a binary STL.'"
        data-testid="download-tray"
        @click="downloadTray"
      >
        {{ isExporting ? "Exporting…" : "Download Tray STL" }}
      </button>
      <button
        type="button"
        class="btn"
        :disabled="isExporting"
        title="Download the non-parametric universal hinge base as a binary STL."
        data-testid="download-hinge"
        @click="downloadHingeBase"
      >
        Download Hinge Base STL
      </button>
    </div>
    <p v-if="trayDisabledReason" class="hint" role="status">
      {{ trayDisabledReason }}
    </p>
    <p v-if="exportError" class="error" role="alert">Export failed: {{ exportError }}</p>
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

.error {
  margin: 0;
  color: #d14343;
  font-size: 0.8rem;
}
</style>
