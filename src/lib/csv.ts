/**
 * CSV import/export for drill-bit sets.
 *
 * The public contract is the three-column format `diameter,unit,label`:
 *   - `diameter` is a number in the row's own unit (mm for metric, inches for
 *     imperial). Imperial accepts the same syntax as the UI — decimals,
 *     fractions (`1/4`), and mixed numbers (`1 1/2`).
 *   - `unit` is the literal string `metric` or `imperial` (case-insensitive).
 *   - `label` is free text; may be empty, may be quoted if it contains commas
 *     or newlines.
 *
 * An optional header row (`diameter,unit,label`, case-insensitive) is detected
 * and skipped. Parsing continues past malformed rows so the caller can surface
 * per-row errors without losing the valid entries.
 *
 * Lexing (quote handling, CRLF/LF/CR, doubled-quote escapes) is delegated to
 * Papa Parse; everything in this module is the bit-set-specific validation
 * and serialization layer on top.
 */
import Papa from "papaparse";
import type { Bit } from "../stores/bitSet";
import { inchesFromMm, parseDiameter, type BitUnit, type ParseResult } from "./units";

export interface CsvBitRow {
  /** Diameter in the row's declared unit (mm for metric, inches for imperial). */
  diameter: number;
  unit: BitUnit;
  label: string;
}

export interface CsvParseError {
  /** 1-based source line number (matches editor gutters). */
  line: number;
  message: string;
}

export interface CsvParseResult {
  rows: CsvBitRow[];
  errors: CsvParseError[];
}

// --- Row validation --------------------------------------------------------

function isHeader(fields: readonly string[]): boolean {
  if (fields.length < 2) return false;
  const a = fields[0]?.trim().toLowerCase();
  const b = fields[1]?.trim().toLowerCase();
  return a === "diameter" && b === "unit";
}

function parseUnit(raw: string): BitUnit | null {
  const lower = raw.trim().toLowerCase();
  if (lower === "metric" || lower === "mm") return "metric";
  if (lower === "imperial" || lower === "in" || lower === "inch" || lower === "inches") {
    return "imperial";
  }
  return null;
}

/**
 * Parse a CSV document into bit rows plus a list of per-row errors.
 *
 * Valid rows survive alongside errors — the caller chooses whether to commit
 * the valid rows, surface errors, or both.
 */
export function parseBitCsv(text: string): CsvParseResult {
  // `header: false` keeps row indexes aligned with source lines so we can
  // surface accurate line numbers in errors. We deliberately DON'T pass
  // `skipEmptyLines` — Papa would compact `data`, breaking the index→line
  // mapping. Instead we filter blank rows in the loop below.
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    delimiter: ",",
  });

  const rows: CsvBitRow[] = [];
  const errors: CsvParseError[] = [];

  // Papa-level parsing errors (e.g. unclosed quotes) carry a 0-based `row`
  // index into `data` — but for malformed quoting it may also report a row
  // beyond `data.length`. Surface those as line-numbered errors using the
  // best info Papa gives us.
  for (const err of parsed.errors) {
    const sourceRow = typeof err.row === "number" ? err.row : 0;
    errors.push({
      line: sourceRow + 1,
      message: err.message,
    });
  }

  let sawHeader = false;
  for (let i = 0; i < parsed.data.length; i += 1) {
    const fields = parsed.data[i] ?? [];
    const lineNumber = i + 1;

    // Skip blank lines (Papa returns `[""]` for them) — they shouldn't
    // generate an error.
    if (fields.length === 0 || (fields.length === 1 && fields[0]?.trim() === "")) {
      continue;
    }

    if (!sawHeader && isHeader(fields)) {
      sawHeader = true;
      continue;
    }
    sawHeader = true;

    // Papa returns single-cell arrays for unquoted lines without commas; we
    // require at least diameter + unit.
    const nonEmptyCount = fields.filter((f) => f.trim() !== "").length;
    if (fields.length < 2 || nonEmptyCount < 2) {
      errors.push({
        line: lineNumber,
        message: "Expected at least two columns: diameter,unit[,label].",
      });
      continue;
    }

    const rawDiameter = fields[0]?.trim() ?? "";
    const rawUnit = fields[1] ?? "";
    const rawLabel = fields[2] ?? "";

    const unit = parseUnit(rawUnit);
    if (unit === null) {
      errors.push({
        line: lineNumber,
        message: `Unknown unit "${rawUnit.trim()}"; expected "metric" or "imperial".`,
      });
      continue;
    }

    const parsedDiameter: ParseResult = parseDiameter(rawDiameter, unit);
    if (!parsedDiameter.ok) {
      errors.push({
        line: lineNumber,
        message: `Invalid diameter "${rawDiameter}": ${parsedDiameter.error}`,
      });
      continue;
    }

    rows.push({
      diameter: parsedDiameter.value,
      unit,
      label: rawLabel.trim(),
    });
  }

  return { rows, errors };
}

// --- Export ----------------------------------------------------------------

/**
 * Render a diameter for CSV export. Metric bits are written as canonical
 * millimeters; imperial bits are written as decimal inches. The format is
 * chosen to round-trip exactly through `parseBitCsv` — i.e. re-importing the
 * exported text produces the same canonical `diameterMm`.
 */
function formatDiameterForExport(bit: Pick<Bit, "diameterMm" | "unit">): string {
  const value = bit.unit === "imperial" ? inchesFromMm(bit.diameterMm) : bit.diameterMm;
  // Use the shortest unambiguous numeric representation JS produces.
  return String(value);
}

/**
 * Serialize a bit list as a CSV document with a header row. Labels are quoted
 * by Papa Parse as needed; an empty label emits an empty third field.
 */
export function formatBitsCsv(bits: readonly Pick<Bit, "diameterMm" | "unit" | "label">[]): string {
  const data = bits.map((bit) => ({
    diameter: formatDiameterForExport(bit),
    unit: bit.unit,
    label: bit.label,
  }));
  const csv = Papa.unparse(data, {
    columns: ["diameter", "unit", "label"],
    newline: "\n",
  });
  // Papa omits the trailing newline; add one for POSIX-friendliness. The
  // parser ignores it.
  return `${csv}\n`;
}
