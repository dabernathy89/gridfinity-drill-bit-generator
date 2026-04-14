<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useBitSetStore } from "../stores/bitSet";
import { formatBitsCsv, parseBitCsv, type CsvParseError } from "../lib/csv";

const store = useBitSetStore();
const { bits, setName } = storeToRefs(store);

const csvText = ref<string>("");
const errors = ref<CsvParseError[]>([]);
const lastImportCount = ref<number | null>(null);

async function onFileChosen(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  const text = await file.text();
  csvText.value = text;
  // Clear the input so choosing the same file again re-triggers change.
  target.value = "";
}

function importCsv(): void {
  const { rows, errors: parseErrors } = parseBitCsv(csvText.value);
  errors.value = parseErrors;
  for (const row of rows) {
    store.addBit({
      diameter: row.diameter,
      unit: row.unit,
      label: row.label,
    });
  }
  lastImportCount.value = rows.length;
  if (parseErrors.length === 0) {
    // Fully clean import — clear the textarea for a tidy UX.
    csvText.value = "";
  }
}

function slugify(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "bit-set";
}

const exportFilename = computed(() => `${slugify(setName.value)}.csv`);

function exportCsv(): void {
  const csv = formatBitsCsv(bits.value);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFilename.value;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="csv-panel" aria-label="CSV import and export">
    <div class="csv-header">
      <h3 class="csv-title">CSV</h3>
      <div class="csv-actions">
        <label class="btn file-btn">
          Choose file
          <input type="file" accept=".csv,text/csv" class="file-input" @change="onFileChosen" />
        </label>
        <button type="button" class="btn" :disabled="bits.length === 0" @click="exportCsv">
          Export CSV
        </button>
      </div>
    </div>

    <label class="field">
      <span class="field-label">
        Paste CSV
        <span class="hint">columns: diameter, unit, label (header optional)</span>
      </span>
      <textarea
        v-model="csvText"
        class="input textarea"
        rows="4"
        placeholder='5.5,metric,5.5 mm&#10;0.25,imperial,1/4" wood'
      />
    </label>

    <div class="csv-actions csv-import-actions">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="csvText.trim() === ''"
        @click="importCsv"
      >
        Import
      </button>
    </div>

    <p
      v-if="lastImportCount !== null && errors.length === 0"
      class="status status-ok"
      role="status"
    >
      Imported {{ lastImportCount }} bit{{ lastImportCount === 1 ? "" : "s" }}.
    </p>
    <div v-if="errors.length > 0" class="status status-errors" role="alert">
      <p class="status-summary">
        <span v-if="lastImportCount !== null && lastImportCount > 0">
          Imported {{ lastImportCount }} bit{{ lastImportCount === 1 ? "" : "s" }};
        </span>
        {{ errors.length }} row{{ errors.length === 1 ? "" : "s" }} could not be parsed:
      </p>
      <ul class="error-list">
        <li v-for="err in errors" :key="`${err.line}-${err.message}`">
          Line {{ err.line }}: {{ err.message }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.csv-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
}

.csv-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.csv-title {
  margin: 0;
  font-size: 0.95rem;
}

.csv-actions {
  display: inline-flex;
  gap: 0.3rem;
}

.csv-import-actions {
  justify-content: flex-end;
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
}

.hint {
  font-weight: normal;
  color: var(--muted);
  font-size: 0.75rem;
}

.input {
  font: inherit;
  color: inherit;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.4rem 0.55rem;
}

.textarea {
  font-family: var(--mono);
  font-size: 0.85rem;
  resize: vertical;
  min-height: 4rem;
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

.file-btn {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.status {
  font-size: 0.85rem;
  margin: 0;
}

.status-ok {
  color: var(--muted);
}

.status-errors {
  color: #d14343;
}

.status-summary {
  margin: 0 0 0.25rem;
}

.error-list {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
</style>
