<script setup lang="ts">
/**
 * Live 3D preview canvas (US-010).
 *
 * Renders `buildPreviewSolids(...)` using `@jscad/regl-renderer`. The preview
 * and the STL export share the SAME JSCAD function call per CLAUDE.md —
 * this component never synthesizes its own geometry. It just hands the
 * solids produced by `buildTray` / `buildHingeBase` to the renderer.
 *
 * Store changes are re-rendered on a debounced watcher (~150ms) so typing
 * into numeric inputs doesn't thrash the CSG pipeline.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useBitSetStore, type Bit, type Calibration, type Footprint } from "../stores/bitSet";
import { buildPreviewSolids, type PreviewInput, type PreviewMode } from "../lib/geometry/preview";
import { validateFit } from "../lib/validation";

const store = useBitSetStore();
const { bits, footprint, calibration } = storeToRefs(store);

const viewMode = ref<PreviewMode>("tray");
const canvasContainer = ref<HTMLDivElement | null>(null);
const errorMessage = ref<string | null>(null);
const previewMs = ref<number | null>(null);

/**
 * Re-rendering the empty preview every keystroke is wasted CSG work. The
 * fit check in US-007 is cheap enough to run every change, and its result
 * is useful as a hint next to the canvas.
 */
const fit = computed(() => validateFit(bits.value, footprint.value, calibration.value));

// ---- Renderer state ----------------------------------------------------
// These are mutable scratch values owned by the component instance. Typed
// loosely because `@jscad/regl-renderer` ships `any`-shaped defaults; we
// don't actually care about the inner fields — we just hand them back to
// the same renderer functions.
interface ReglRendererState {
  renderFn: (options: unknown) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  camera: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsState: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gridEntity: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  axisEntity: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  solidEntities: any[];
  width: number;
  height: number;
  dirty: boolean;
  rafHandle: number | null;
  resizeObserver: ResizeObserver | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drawCommands: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  perspectiveCamera: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orbitControls: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entitiesFromSolids: any;
}

let rendererState: ReglRendererState | null = null;

// Mouse drag state. Kept at module scope inside setup so handlers can share it.
interface DragState {
  pointerId: number;
  kind: "rotate" | "pan";
  lastX: number;
  lastY: number;
}
let drag: DragState | null = null;

// ---- Debounced re-render ----------------------------------------------

/** Preview re-render debounce. Matches the ~150ms window called out in
 * CLAUDE.md so typing into inputs doesn't re-run CSG per keystroke. */
const RENDER_DEBOUNCE_MS = 150;
let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleRebuild(immediate = false): void {
  if (rebuildTimeout !== null) {
    clearTimeout(rebuildTimeout);
    rebuildTimeout = null;
  }
  if (immediate) {
    rebuildSolids();
    return;
  }
  rebuildTimeout = setTimeout(() => {
    rebuildTimeout = null;
    rebuildSolids();
  }, RENDER_DEBOUNCE_MS);
}

/**
 * Build the JSCAD solids for the current inputs + view mode and hand them
 * to the regl renderer. Also records the wall-clock cost so the panel can
 * surface the "renders within 500ms" AC as a lightweight diagnostic.
 */
function rebuildSolids(): void {
  const state = rendererState;
  if (state === null) return;
  const started = performance.now();
  try {
    const input: PreviewInput = snapshotInput(bits.value, footprint.value, calibration.value);
    const solids = buildPreviewSolids(viewMode.value, input);
    state.solidEntities = state.entitiesFromSolids({ smoothNormals: true }, ...solids);
    // Ask the orbit controls to re-center on the new geometry so the user
    // never gets stranded zoomed-out-to-infinity after a big change.
    const fitted = state.orbitControls.zoomToFit({
      controls: state.controlsState,
      camera: state.camera,
      entities: state.solidEntities,
    });
    state.controlsState = { ...state.controlsState, ...fitted.controls };
    state.camera = { ...state.camera, ...fitted.camera };
    errorMessage.value = null;
    state.dirty = true;
    previewMs.value = performance.now() - started;
  } catch (err) {
    // Surface geometry errors to the user instead of leaving the canvas
    // silently stale. Keeps debugging friendly while the spec still has
    // Open Questions (e.g., label glyph rendering at tiny sizes).
    errorMessage.value = err instanceof Error ? err.message : String(err);
    previewMs.value = performance.now() - started;
  }
}

/**
 * Snapshot the reactive store refs into a plain object `buildPreviewSolids`
 * can consume. Keeps the geometry pipeline pure (no reactivity leaks into
 * the solids).
 */
function snapshotInput(
  bitsIn: readonly Bit[],
  footprintIn: Footprint,
  calibrationIn: Calibration,
): PreviewInput {
  return {
    bits: bitsIn.map((b) => ({ diameterMm: b.diameterMm, label: b.label })),
    footprint: { widthU: footprintIn.widthU, heightUnits7mm: footprintIn.heightUnits7mm },
    calibration: { ...calibrationIn },
  };
}

// ---- Lifecycle --------------------------------------------------------

onMounted(async () => {
  const container = canvasContainer.value;
  if (container === null) return;

  // Dynamic import so Vite code-splits the big regl runtime out of the
  // initial bundle, and so unit-test environments (jsdom) never try to
  // load WebGL.
  let reglModule: typeof import("@jscad/regl-renderer");
  try {
    reglModule = await import("@jscad/regl-renderer");
  } catch (err) {
    errorMessage.value =
      "Could not load the 3D preview renderer. " +
      (err instanceof Error ? err.message : String(err));
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = reglModule as any;
  const {
    prepareRender,
    drawCommands,
    cameras,
    controls: reglControlsNs,
    entitiesFromSolids,
  } = mod;

  // Create the canvas inside the container (regl wants a DOM container to
  // attach its own <canvas> into). We clear any leftover children in case
  // the component is re-mounted by HMR.
  while (container.firstChild) container.removeChild(container.firstChild);
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  canvas.setAttribute("data-testid", "preview-canvas");
  container.appendChild(canvas);

  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));

  const perspectiveCamera = cameras.perspective;
  const camera = { ...perspectiveCamera.defaults };
  perspectiveCamera.setProjection(camera, camera, { width, height });
  perspectiveCamera.update(camera, camera);

  const orbitControls = reglControlsNs.orbit;
  const controlsState = { ...orbitControls.defaults };

  let renderFn: (options: unknown) => void;
  try {
    renderFn = prepareRender({
      glOptions: { canvas, pixelRatio: window.devicePixelRatio ?? 1 },
    });
  } catch (err) {
    errorMessage.value =
      "Could not initialize WebGL for the preview. " +
      (err instanceof Error ? err.message : String(err));
    return;
  }

  const gridEntity = {
    visuals: { drawCmd: "drawGrid", show: true },
    size: [GRID_SIZE_MM, GRID_SIZE_MM],
    ticks: [GRIDFINITY_U_PX, GRIDFINITY_CELL_PX],
    color: [0, 0, 0, 0.35],
    subColor: [0, 0, 0, 0.18],
  };
  const axisEntity = { visuals: { drawCmd: "drawAxis", show: true }, size: 40 };

  rendererState = {
    renderFn,
    camera,
    controlsState,
    gridEntity,
    axisEntity,
    solidEntities: [],
    width,
    height,
    dirty: true,
    rafHandle: null,
    resizeObserver: null,
    drawCommands,
    perspectiveCamera,
    orbitControls,
    entitiesFromSolids,
  };

  // Resize observer keeps the canvas + camera projection in sync with the
  // container; the orbit controls respect camera.viewport for pan math.
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      handleResize();
    });
    ro.observe(container);
    rendererState.resizeObserver = ro;
  }

  // Mouse events on the canvas (pointer events so touch + mouse work the same).
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("pointerleave", handlePointerUp);
  canvas.addEventListener("wheel", handleWheel, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // Kick off the render loop, then do the first solid build.
  startLoop();
  rebuildSolids();
});

onBeforeUnmount(() => {
  const state = rendererState;
  if (state !== null) {
    if (state.rafHandle !== null) cancelAnimationFrame(state.rafHandle);
    state.resizeObserver?.disconnect();
  }
  if (rebuildTimeout !== null) clearTimeout(rebuildTimeout);
  rendererState = null;
});

// ---- Resize & loop ----------------------------------------------------

function handleResize(): void {
  const state = rendererState;
  const container = canvasContainer.value;
  if (state === null || container === null) return;
  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (width === state.width && height === state.height) return;
  state.width = width;
  state.height = height;
  state.perspectiveCamera.setProjection(state.camera, state.camera, { width, height });
  state.dirty = true;
}

function startLoop(): void {
  const state = rendererState;
  if (state === null) return;
  const tick = (): void => {
    const s = rendererState;
    if (s === null) return;
    // Orbit-controls update applies drag damping per-frame even when the
    // user isn't actively dragging — needed so momentum decays to zero
    // after a flick.
    const updated = s.orbitControls.update({
      controls: s.controlsState,
      camera: s.camera,
    });
    s.controlsState = { ...s.controlsState, ...updated.controls };
    s.camera = { ...s.camera, ...updated.camera };
    if (updated.controls.changed) s.dirty = true;

    if (s.dirty) {
      s.perspectiveCamera.update(s.camera, s.camera);
      const options = {
        camera: s.camera,
        drawCommands: {
          drawAxis: s.drawCommands.drawAxis,
          drawGrid: s.drawCommands.drawGrid,
          drawLines: s.drawCommands.drawLines,
          drawMesh: s.drawCommands.drawMesh,
        },
        entities: [s.gridEntity, s.axisEntity, ...s.solidEntities],
      };
      s.renderFn(options);
      s.dirty = false;
    }

    s.rafHandle = requestAnimationFrame(tick);
  };
  state.rafHandle = requestAnimationFrame(tick);
}

// ---- Input handlers ---------------------------------------------------

function handlePointerDown(event: PointerEvent): void {
  const state = rendererState;
  if (state === null) return;
  // RMB or shift+LMB → pan. LMB alone → rotate. Middle button → pan.
  const isPan = event.button === 1 || event.button === 2 || (event.button === 0 && event.shiftKey);
  drag = {
    pointerId: event.pointerId,
    kind: isPan ? "pan" : "rotate",
    lastX: event.clientX,
    lastY: event.clientY,
  };
  (event.target as Element).setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function handlePointerMove(event: PointerEvent): void {
  const state = rendererState;
  if (state === null || drag === null || drag.pointerId !== event.pointerId) return;
  const dx = event.clientX - drag.lastX;
  const dy = event.clientY - drag.lastY;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;

  if (drag.kind === "rotate") {
    // Scale to radians per pixel; orbit controls integrates these over
    // frames with `drag` damping so the view keeps moving briefly after
    // release.
    const rotated = state.orbitControls.rotate(
      { controls: state.controlsState, camera: state.camera, speed: 0.0075 },
      [dx, dy],
    );
    state.controlsState = { ...state.controlsState, ...rotated.controls };
  } else {
    const panned = state.orbitControls.pan(
      { controls: state.controlsState, camera: state.camera, speed: 0.75 },
      [dx, dy],
    );
    state.controlsState = { ...state.controlsState, ...panned.controls };
    state.camera = { ...state.camera, ...panned.camera };
  }
  state.dirty = true;
}

function handlePointerUp(event: PointerEvent): void {
  if (drag === null || drag.pointerId !== event.pointerId) return;
  (event.target as Element).releasePointerCapture?.(event.pointerId);
  drag = null;
}

function handleWheel(event: WheelEvent): void {
  const state = rendererState;
  if (state === null) return;
  event.preventDefault();
  // Trackpad wheels emit small deltaY per tick; mice emit ~120. Normalize
  // to a unit-ish step so orbit.zoom's sign-based clamp behaves the same
  // for both.
  const step = Math.sign(event.deltaY) * Math.min(1, Math.abs(event.deltaY) / 100);
  const zoomed = state.orbitControls.zoom(
    { controls: state.controlsState, camera: state.camera, speed: 0.1 },
    step,
  );
  state.controlsState = { ...state.controlsState, ...zoomed.controls };
  state.camera = { ...state.camera, ...zoomed.camera };
  state.dirty = true;
}

// ---- Reactive wiring --------------------------------------------------

// `deep` so mutations to `calibration.drillHoleToleranceMm` etc. trigger.
// `footprint` and `bits` already trigger on array/object changes via Pinia.
watch(
  [bits, footprint, calibration],
  () => {
    scheduleRebuild();
  },
  { deep: true },
);

// View-mode changes are user-initiated and infrequent — rebuild immediately.
watch(viewMode, () => scheduleRebuild(true));

// ---- Presentation constants ------------------------------------------

/** Grid drawn on the XY plane. Sized to comfortably enclose both parts. */
const GRID_SIZE_MM = 200;
/** Minor grid lines per Gridfinity 7mm sub-unit. */
const GRIDFINITY_CELL_PX = 7;
/** Major grid lines per Gridfinity 1U cell. */
const GRIDFINITY_U_PX = 42;
</script>

<template>
  <section class="preview" aria-label="3D preview">
    <header class="preview-header">
      <h2>Preview</h2>
      <fieldset class="view-toggle" data-testid="preview-view-toggle">
        <legend class="visually-hidden">View mode</legend>
        <label>
          <input type="radio" value="tray" v-model="viewMode" />
          Tray only
        </label>
        <label>
          <input type="radio" value="hinge" v-model="viewMode" />
          Hinge base only
        </label>
        <label>
          <input type="radio" value="both" v-model="viewMode" />
          Both assembled
        </label>
      </fieldset>
    </header>
    <div
      ref="canvasContainer"
      class="canvas-container"
      data-testid="preview-canvas-container"
      role="img"
      aria-label="Live 3D preview of the tray and hinge base"
    ></div>
    <footer class="preview-footer">
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-else-if="!fit.ok" class="hint" role="status">
        Preview shown but the current bit row overflows the selected footprint; see inputs for the
        required minimum width.
      </p>
      <p v-else-if="previewMs !== null" class="hint" role="status">
        Rendered in {{ Math.round(previewMs) }} ms
        <span v-if="bits.length > 0">· {{ bits.length }} bits</span>
      </p>
      <p v-else class="hint">Drag to orbit · shift-drag or right-drag to pan · wheel to zoom</p>
    </footer>
  </section>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 480px;
  gap: 0.5rem;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.preview-header h2 {
  margin: 0;
  font-size: 1.1rem;
}

.view-toggle {
  display: flex;
  gap: 0.75rem;
  border: none;
  padding: 0;
  margin: 0;
  font-size: 0.9rem;
  flex-wrap: wrap;
}

.view-toggle label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
}

.canvas-container {
  position: relative;
  flex: 1;
  min-height: 320px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  overflow: hidden;
  /* Canvas pointer-events need a block so touch-action:none applies to the
     whole render surface. */
  touch-action: none;
}

.preview-footer {
  min-height: 1.5em;
}

.hint {
  color: var(--muted);
  font-size: 0.85rem;
}

.error {
  color: #c2410c;
  font-size: 0.85rem;
  margin: 0;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
