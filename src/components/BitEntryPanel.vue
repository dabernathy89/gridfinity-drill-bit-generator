<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import { useBitSetStore } from "../stores/bitSet";
import { parseDiameter, toDisplay, type BitUnit } from "../lib/units";
import PresetPicker from "./PresetPicker.vue";
import CsvImportExport from "./CsvImportExport.vue";

const store = useBitSetStore();
const { setName, bits } = storeToRefs(store);

// --- Add-bit form -------------------------------------------------------

interface DraftState {
  diameter: string;
  unit: BitUnit;
  label: string;
}

const draft = reactive<DraftState>({ diameter: "", unit: "metric", label: "" });
const addAttempted = ref(false);

const addError = computed<string | null>(() => {
  if (!addAttempted.value && draft.diameter.trim() === "") return null;
  const parsed = parseDiameter(draft.diameter, draft.unit);
  return parsed.ok ? null : parsed.error;
});

function submitAdd(): void {
  addAttempted.value = true;
  const parsed = parseDiameter(draft.diameter, draft.unit);
  if (!parsed.ok) return;
  store.addBit({
    diameter: parsed.value,
    unit: draft.unit,
    label: draft.label.trim(),
  });
  draft.diameter = "";
  draft.label = "";
  addAttempted.value = false;
}

// --- Per-row edit state -------------------------------------------------

interface EditState {
  id: string;
  diameter: string;
  unit: BitUnit;
  label: string;
  error: string | null;
}

const editing = ref<EditState | null>(null);

function startEdit(id: string): void {
  const bit = bits.value.find((b) => b.id === id);
  if (!bit) return;
  // Seed the diameter input with the user's preferred-unit representation
  // (unformatted — inches as decimal, mm as decimal) so it's immediately
  // editable without stripping "mm" or inch marks.
  const seed =
    bit.unit === "imperial"
      ? String(Math.round((bit.diameterMm / 25.4) * 1e6) / 1e6)
      : String(Math.round(bit.diameterMm * 1e6) / 1e6);
  editing.value = {
    id,
    diameter: seed,
    unit: bit.unit,
    label: bit.label,
    error: null,
  };
}

function cancelEdit(): void {
  editing.value = null;
}

function saveEdit(): void {
  const state = editing.value;
  if (!state) return;
  const parsed = parseDiameter(state.diameter, state.unit);
  if (!parsed.ok) {
    state.error = parsed.error;
    return;
  }
  store.updateBit(state.id, {
    diameter: parsed.value,
    unit: state.unit,
    label: state.label.trim(),
  });
  editing.value = null;
}

// --- Reordering: move buttons + native HTML5 drag-and-drop --------------

function moveUp(idx: number): void {
  store.reorderBits(idx, idx - 1);
}
function moveDown(idx: number): void {
  store.reorderBits(idx, idx + 1);
}

const dragIndex = ref<number | null>(null);

function onDragStart(event: DragEvent, idx: number): void {
  dragIndex.value = idx;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    // Required for Firefox to initiate a drag session.
    event.dataTransfer.setData("text/plain", String(idx));
  }
}

function onDragOver(event: DragEvent): void {
  if (dragIndex.value === null) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function onDrop(event: DragEvent, idx: number): void {
  event.preventDefault();
  const from = dragIndex.value;
  dragIndex.value = null;
  if (from === null || from === idx) return;
  store.reorderBits(from, idx);
}

function onDragEnd(): void {
  dragIndex.value = null;
}
</script>

<template>
  <div class="bit-entry-panel">
    <label class="field set-name-field">
      <span class="field-label">Set name</span>
      <input
        v-model="setName"
        type="text"
        placeholder="e.g. Metric drill index 1–13mm"
        class="input"
      />
    </label>

    <PresetPicker />

    <CsvImportExport />

    <form class="add-row" @submit.prevent="submitAdd">
      <div class="field diameter-field">
        <span class="field-label">Diameter</span>
        <input
          v-model="draft.diameter"
          type="text"
          :placeholder="draft.unit === 'imperial' ? 'e.g. 1/4 or 0.25' : 'e.g. 5.5'"
          class="input"
          inputmode="decimal"
          :aria-invalid="addError !== null"
        />
      </div>

      <div class="field unit-field">
        <span class="field-label">Unit</span>
        <div class="unit-toggle" role="radiogroup" aria-label="Unit">
          <label :class="['unit-option', { active: draft.unit === 'metric' }]">
            <input v-model="draft.unit" type="radio" name="draft-unit" value="metric" />
            <span>mm</span>
          </label>
          <label :class="['unit-option', { active: draft.unit === 'imperial' }]">
            <input v-model="draft.unit" type="radio" name="draft-unit" value="imperial" />
            <span>in</span>
          </label>
        </div>
      </div>

      <div class="field label-field">
        <span class="field-label">Label <span class="optional">(optional)</span></span>
        <input v-model="draft.label" type="text" class="input" placeholder="e.g. 1/4 wood" />
      </div>

      <div class="add-actions">
        <button type="submit" class="btn btn-primary" :disabled="addError !== null">Add bit</button>
      </div>

      <p v-if="addError" class="error-msg" role="alert">{{ addError }}</p>
    </form>

    <ol v-if="bits.length > 0" class="bit-list" aria-label="Bits in this set">
      <li
        v-for="(bit, idx) in bits"
        :key="bit.id"
        :class="['bit-row', { dragging: dragIndex === idx }]"
        :draggable="editing?.id !== bit.id"
        @dragstart="onDragStart($event, idx)"
        @dragover="onDragOver"
        @drop="onDrop($event, idx)"
        @dragend="onDragEnd"
      >
        <template v-if="editing?.id === bit.id">
          <div class="edit-grid">
            <label class="field">
              <span class="field-label">Diameter</span>
              <input
                v-model="editing.diameter"
                type="text"
                class="input"
                :aria-invalid="editing.error !== null"
              />
            </label>
            <div class="field">
              <span class="field-label">Unit</span>
              <div class="unit-toggle" role="radiogroup" aria-label="Unit">
                <label :class="['unit-option', { active: editing.unit === 'metric' }]">
                  <input
                    v-model="editing.unit"
                    type="radio"
                    :name="`edit-unit-${bit.id}`"
                    value="metric"
                  />
                  <span>mm</span>
                </label>
                <label :class="['unit-option', { active: editing.unit === 'imperial' }]">
                  <input
                    v-model="editing.unit"
                    type="radio"
                    :name="`edit-unit-${bit.id}`"
                    value="imperial"
                  />
                  <span>in</span>
                </label>
              </div>
            </div>
            <label class="field">
              <span class="field-label">Label</span>
              <input v-model="editing.label" type="text" class="input" />
            </label>
            <div class="edit-actions">
              <button type="button" class="btn btn-primary" @click="saveEdit">Save</button>
              <button type="button" class="btn" @click="cancelEdit">Cancel</button>
            </div>
            <p v-if="editing.error" class="error-msg" role="alert">{{ editing.error }}</p>
          </div>
        </template>
        <template v-else>
          <span class="drag-handle" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
          <span class="bit-diameter">{{ toDisplay(bit.diameterMm, bit.unit) }}</span>
          <span class="bit-label">{{ bit.label || "—" }}</span>
          <div class="row-actions">
            <button
              type="button"
              class="btn btn-icon"
              :disabled="idx === 0"
              aria-label="Move up"
              @click="moveUp(idx)"
            >
              ↑
            </button>
            <button
              type="button"
              class="btn btn-icon"
              :disabled="idx === bits.length - 1"
              aria-label="Move down"
              @click="moveDown(idx)"
            >
              ↓
            </button>
            <button type="button" class="btn" @click="startEdit(bit.id)">Edit</button>
            <button
              type="button"
              class="btn btn-danger"
              aria-label="Delete"
              @click="store.removeBit(bit.id)"
            >
              Delete
            </button>
          </div>
        </template>
      </li>
    </ol>
    <p v-else class="empty-hint">No bits yet. Add your first bit above, or load a preset.</p>
  </div>
</template>

<style scoped>
.bit-entry-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
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

.optional {
  color: var(--muted);
  font-weight: normal;
}

.input {
  font: inherit;
  color: inherit;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.4rem 0.55rem;
}

.input[aria-invalid="true"] {
  border-color: #d14343;
}

.add-row {
  display: grid;
  grid-template-columns: 1fr 5.5rem 1.25fr auto;
  gap: 0.5rem 0.75rem;
  align-items: end;
  padding: 0.75rem;
  border: 1px dashed var(--border);
  border-radius: 4px;
  background: var(--bg);
}

.add-row .error-msg {
  grid-column: 1 / -1;
}

.unit-toggle {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.unit-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  user-select: none;
  background: var(--bg);
  min-width: 2.25rem;
}

.unit-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.unit-option.active {
  background: var(--accent);
  color: white;
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

.btn-danger {
  border-color: #d14343;
  color: #d14343;
}

.btn-icon {
  min-width: 2rem;
  padding: 0.3rem 0.5rem;
}

.error-msg {
  color: #d14343;
  font-size: 0.85rem;
}

.bit-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.bit-row {
  display: grid;
  grid-template-columns: auto 5rem 1fr auto;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
}

.bit-row.dragging {
  opacity: 0.5;
}

.drag-handle {
  cursor: grab;
  color: var(--muted);
  user-select: none;
}

.bit-diameter {
  font-family: var(--mono);
}

.bit-label {
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-actions {
  display: inline-flex;
  gap: 0.3rem;
}

.edit-grid {
  display: grid;
  grid-template-columns: 1fr 5.5rem 1.25fr auto;
  gap: 0.5rem 0.75rem;
  align-items: end;
  width: 100%;
}

.edit-grid .error-msg {
  grid-column: 1 / -1;
}

.edit-actions {
  display: inline-flex;
  gap: 0.3rem;
}

.empty-hint {
  color: var(--muted);
  font-style: italic;
}

@media (max-width: 600px) {
  .add-row,
  .edit-grid {
    grid-template-columns: 1fr 1fr;
  }
  .bit-row {
    grid-template-columns: auto 1fr auto;
  }
  .bit-label {
    grid-column: 1 / -1;
  }
}
</style>
