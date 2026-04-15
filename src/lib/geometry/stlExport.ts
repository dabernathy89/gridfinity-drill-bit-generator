/**
 * STL export (US-011).
 *
 * Serializes the tray and hinge base `Geom3`s into binary STL bytes and
 * triggers a browser download. Per CLAUDE.md and the US-010 preview module,
 * there is exactly one geometry pipeline per part: the preview canvas and
 * the STL exporter both call `buildTray` / `buildHingeBase` — this module
 * adds the serializer-and-blob plumbing but never synthesizes its own
 * geometry.
 *
 * Binary STL is used (smaller, faster to write) with the jscad
 * `@jscad/stl-serializer`, which returns an array of `ArrayBuffer` chunks
 * (header + triangle count + triangle payload) ready to feed into `new Blob`.
 */
import { serialize as serializeStl } from "@jscad/stl-serializer";
import type { Geom3 } from "@jscad/modeling/src/geometries/types";
import { buildTray, type TrayInput } from "./tray";
import { buildHingeBase, type HingeBaseCalibration } from "./hingeBase";

/** Fixed filename for Part A — the hinge base is non-parametric, so the
 * STL has no user-specific identity to encode. */
export const HINGE_BASE_STL_FILENAME = "universal-hinge-base.stl";

/**
 * Serialize a `Geom3` to a binary STL as an array of `ArrayBuffer`s. The
 * chunks can be passed straight to `new Blob(chunks, { type: STL_MIME_TYPE })`.
 * Callers normally use `buildTrayStlBlob` / `buildHingeBaseStlBlob` below; this
 * helper is exported so tests can assert the byte-level shape of the STL.
 */
export function serializeGeomToStl(geom: Geom3): ArrayBuffer[] {
  return serializeStl({ binary: true }, geom);
}

/** STL MIME type per the `@jscad/stl-serializer` constant. */
export const STL_MIME_TYPE = "application/sla";

/**
 * Build the tray solid and serialize it to a binary STL `Blob`. Uses the
 * exact `buildTray` call the preview uses — the preview and export cannot
 * diverge because there is only one `buildTray` in the codebase.
 */
export function buildTrayStlBlob(input: TrayInput): Blob {
  const tray = buildTray(input);
  return new Blob(serializeGeomToStl(tray), { type: STL_MIME_TYPE });
}

/**
 * Build the hinge base solid and serialize it to a binary STL `Blob`.
 * Calibration is optional — callers who have a store `Calibration` can pass
 * the relevant subset; otherwise the CLAUDE.md defaults apply.
 */
export function buildHingeBaseStlBlob(calibration?: HingeBaseCalibration): Blob {
  const hinge = buildHingeBase(calibration);
  return new Blob(serializeGeomToStl(hinge), { type: STL_MIME_TYPE });
}

/**
 * Slugify a set name for use as part of a download filename. Mirrors the
 * rule used by the CSV exporter so a user's "Metric Index" set name lands
 * as `metric-index-tray.stl` / `metric-index.csv`. Falls back to
 * `drill-bit-tray` when the name is empty or all-punctuation so the user
 * still gets a sensible filename.
 */
export function slugifySetName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "drill-bit-tray";
}

/**
 * Filename for the tray STL. `<slug>-tray.stl`, where the slug is derived
 * from the current set name.
 */
export function trayStlFilename(setName: string): string {
  return `${slugifySetName(setName)}-tray.stl`;
}

/**
 * Trigger a browser download for the given `Blob` using a synthetic `<a>`.
 * Split out from the geometry helpers so unit tests can serialize geometry
 * without touching the DOM.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}
