<script setup lang="ts">
// Top-level shell. Bit-entry UI and 3D preview land in later stories.
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>Gridfinity Drill Bit Tray Generator</h1>
      <p class="tagline">Design a 3D-printable drill bit tray for a Gridfinity baseplate.</p>
    </header>
    <main class="app-main">
      <section class="panel panel-inputs" aria-label="Bit set inputs">
        <h2>Bit Set</h2>
        <p class="placeholder">Bit entry form will live here.</p>
      </section>
      <section class="panel panel-preview" aria-label="3D preview">
        <h2>Preview</h2>
        <p class="placeholder">Live 3D preview will render here.</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100svh;
}

.app-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.app-header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
}

.tagline {
  color: var(--muted);
  font-size: 0.95rem;
}

.app-main {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(320px, 420px) 1fr;
  padding: 1.5rem;
  flex: 1;
}

.panel {
  border: 1px solid var(--border);
  background: var(--panel-bg);
  border-radius: 6px;
  padding: 1rem;
  min-height: 320px;
}

.panel h2 {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
}

.placeholder {
  color: var(--muted);
  font-style: italic;
}

@media (max-width: 900px) {
  .app-main {
    grid-template-columns: 1fr;
  }
}
</style>
