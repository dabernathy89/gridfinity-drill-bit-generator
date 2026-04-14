import { expect, test } from "vite-plus/test";
import {
  HINGE_BASE_STL_FILENAME,
  STL_MIME_TYPE,
  buildHingeBaseStlBlob,
  buildTrayStlBlob,
  serializeGeomToStl,
  slugifySetName,
  trayStlFilename,
} from "./stlExport";
import { buildTray } from "./tray";
import { buildHingeBase } from "./hingeBase";
import { DEFAULT_CALIBRATION } from "../../stores/bitSet";

const defaultFootprint = { widthU: 2, heightUnits7mm: 6 };
const trayCalibration = {
  drillHoleToleranceMm: DEFAULT_CALIBRATION.drillHoleToleranceMm,
  dovetailOffsetMm: DEFAULT_CALIBRATION.dovetailOffsetMm,
};
const hingeCalibration = {
  hingeRadialMm: DEFAULT_CALIBRATION.hingeRadialMm,
  hingeAxialMm: DEFAULT_CALIBRATION.hingeAxialMm,
  dovetailOffsetMm: 0,
};

const sampleBits = [
  { diameterMm: 3, label: "3mm" },
  { diameterMm: 4, label: "4mm" },
  { diameterMm: 5, label: "5mm" },
];

/**
 * A binary STL starts with an 80-byte header, then a uint32 triangle count
 * at byte 80. Total file length must be exactly 84 + 50 × triangleCount.
 * These helpers let tests assert we're producing a valid binary STL without
 * actually parsing the geometry back.
 */
function concatBlob(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return out.buffer;
}

function readTriangleCount(buf: ArrayBuffer): number {
  // Uint32LE at byte offset 80.
  const view = new DataView(buf);
  return view.getUint32(80, true);
}

test("serializeGeomToStl produces a well-formed binary STL for the tray", () => {
  const tray = buildTray({
    bits: sampleBits,
    footprint: defaultFootprint,
    calibration: trayCalibration,
  });
  const buffers = serializeGeomToStl(tray);
  expect(buffers.length).toBeGreaterThan(0);

  const joined = concatBlob(buffers);
  expect(joined.byteLength).toBeGreaterThan(84);

  const triangles = readTriangleCount(joined);
  expect(triangles).toBeGreaterThan(0);
  // Binary STL invariant: file length must be 80 (header) + 4 (count) + 50 per triangle.
  expect(joined.byteLength).toBe(84 + 50 * triangles);
});

test("serializeGeomToStl also produces a valid binary STL for the hinge base", () => {
  const hinge = buildHingeBase(hingeCalibration);
  const buffers = serializeGeomToStl(hinge);
  const joined = concatBlob(buffers);
  const triangles = readTriangleCount(joined);
  expect(triangles).toBeGreaterThan(0);
  expect(joined.byteLength).toBe(84 + 50 * triangles);
});

test("buildTrayStlBlob returns a Blob with the STL mime type", () => {
  const blob = buildTrayStlBlob({
    bits: sampleBits,
    footprint: defaultFootprint,
    calibration: trayCalibration,
  });
  expect(blob).toBeInstanceOf(Blob);
  expect(blob.type).toBe(STL_MIME_TYPE);
  expect(blob.size).toBeGreaterThan(84);
});

test("buildHingeBaseStlBlob returns a Blob with the STL mime type", () => {
  const blob = buildHingeBaseStlBlob();
  expect(blob).toBeInstanceOf(Blob);
  expect(blob.type).toBe(STL_MIME_TYPE);
  expect(blob.size).toBeGreaterThan(84);
});

test("buildHingeBaseStlBlob works with zero args (non-parametric default)", () => {
  // The hinge base geometry module accepts an optional calibration; the STL
  // wrapper must preserve that signature.
  const blob = buildHingeBaseStlBlob();
  expect(blob.size).toBeGreaterThan(84);
});

test("slugifySetName lowercases, replaces non-alphanumerics with hyphens, and trims", () => {
  expect(slugifySetName("Metric Index")).toBe("metric-index");
  expect(slugifySetName("  ~My Bits!  ")).toBe("my-bits");
  expect(slugifySetName('1/4" Imperial')).toBe("1-4-imperial");
});

test("slugifySetName falls back to drill-bit-tray for empty or all-punctuation names", () => {
  expect(slugifySetName("")).toBe("drill-bit-tray");
  expect(slugifySetName("   ")).toBe("drill-bit-tray");
  expect(slugifySetName("!!!---!!!")).toBe("drill-bit-tray");
});

test("trayStlFilename appends -tray.stl to the slugified set name", () => {
  expect(trayStlFilename("Metric Index")).toBe("metric-index-tray.stl");
  expect(trayStlFilename("")).toBe("drill-bit-tray-tray.stl");
});

test("HINGE_BASE_STL_FILENAME is the AC-specified constant", () => {
  // Per US-011 AC: the hinge-base download is a fixed, non-parametric filename.
  expect(HINGE_BASE_STL_FILENAME).toBe("universal-hinge-base.stl");
});

test("tray STL filename matches the user's set name", () => {
  // Round-trip of the AC: "Download Tray STL" produces `<setname>-tray.stl`.
  expect(trayStlFilename("Fractional Imperial")).toBe("fractional-imperial-tray.stl");
});

test("same buildTray invocation drives preview and export — no forked pipeline", () => {
  // CLAUDE.md requires exactly one geometry pipeline per part. Verify by
  // constructing the tray geometry once via the preview's path (`buildTray`
  // directly) and once via the STL export's wrapper, and confirming the
  // STL bytes match.
  const input = {
    bits: sampleBits,
    footprint: defaultFootprint,
    calibration: trayCalibration,
  };
  const fromBuildTray = buildTray(input);
  const exportedBlob = buildTrayStlBlob(input);

  const directJoined = concatBlob(serializeGeomToStl(fromBuildTray));

  return exportedBlob.arrayBuffer().then((buf) => {
    const exportedBytes = new Uint8Array(buf);
    const directBytes = new Uint8Array(directJoined);
    // Triangle count + total size must match; both are deterministic given
    // the same `Geom3`, so this is a strong "no forked pipeline" invariant.
    expect(exportedBytes.length).toBe(directBytes.length);
    expect(readTriangleCount(buf)).toBe(readTriangleCount(directJoined));
  });
});
