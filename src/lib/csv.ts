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
 */
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

// --- Field tokenizer -------------------------------------------------------

/**
 * Split a CSV document into records of fields. Handles:
 *   - CRLF / LF / CR line endings
 *   - Quoted fields with embedded commas and newlines
 *   - Doubled quotes ("") as an escaped `"` inside a quoted field
 *
 * Returns an array of records; each record is an array of raw field strings
 * alongside the 1-based line number where the record started. Physical
 * records that span multiple source lines (quoted newlines) carry the
 * starting line.
 */
interface RawRecord {
  fields: string[];
  line: number;
}

function tokenize(text: string): RawRecord[] {
  const records: RawRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStart = true; // true when no chars have been accumulated in the current field yet
  let recordStartLine = 1;
  let currentLine = 1;

  const endField = () => {
    fields.push(field);
    field = "";
    fieldStart = true;
  };
  const endRecord = () => {
    fields.push(field);
    // A record with exactly one empty field is a blank line — drop it to
    // avoid synthesizing spurious empty rows for blank input or trailing
    // newlines.
    if (!(fields.length === 1 && fields[0] === "")) {
      records.push({ fields, line: recordStartLine });
    }
    fields = [];
    field = "";
    fieldStart = true;
    recordStartLine = currentLine + 1;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
        if (ch === "\n") currentLine += 1;
      }
      continue;
    }

    if (ch === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
      continue;
    }
    if (ch === ",") {
      endField();
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") {
        endRecord();
        currentLine += 1;
        i += 1;
        continue;
      }
      endRecord();
      currentLine += 1;
      continue;
    }
    if (ch === "\n") {
      endRecord();
      currentLine += 1;
      continue;
    }
    field += ch;
    fieldStart = false;
  }

  // Flush the final record if the document didn't end with a newline.
  if (field.length > 0 || fields.length > 0) {
    fields.push(field);
    if (!(fields.length === 1 && fields[0] === "")) {
      records.push({ fields, line: recordStartLine });
    }
  }

  return records;
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
  const records = tokenize(text);
  const rows: CsvBitRow[] = [];
  const errors: CsvParseError[] = [];

  let sawHeader = false;
  for (const record of records) {
    // Skip fully-empty records (produced by blank lines).
    const allEmpty = record.fields.every((f) => f.trim() === "");
    if (allEmpty) continue;

    if (!sawHeader && isHeader(record.fields)) {
      sawHeader = true;
      continue;
    }
    sawHeader = true;

    if (record.fields.length < 2) {
      errors.push({
        line: record.line,
        message: "Expected at least two columns: diameter,unit[,label].",
      });
      continue;
    }

    const rawDiameter = record.fields[0]?.trim() ?? "";
    const rawUnit = record.fields[1] ?? "";
    const rawLabel = record.fields[2] ?? "";

    const unit = parseUnit(rawUnit);
    if (unit === null) {
      errors.push({
        line: record.line,
        message: `Unknown unit "${rawUnit.trim()}"; expected "metric" or "imperial".`,
      });
      continue;
    }

    const parsed: ParseResult = parseDiameter(rawDiameter, unit);
    if (!parsed.ok) {
      errors.push({
        line: record.line,
        message: `Invalid diameter "${rawDiameter}": ${parsed.error}`,
      });
      continue;
    }

    rows.push({
      diameter: parsed.value,
      unit,
      label: rawLabel.trim(),
    });
  }

  return { rows, errors };
}

// --- Export ----------------------------------------------------------------

/**
 * Escape a field for CSV output. Quotes the field whenever it contains a
 * comma, a quote, a CR, or a LF, and doubles any internal quotes.
 */
function escapeField(value: string): string {
  if (value === "") return "";
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

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
 * as needed; an empty label emits an empty third field.
 */
export function formatBitsCsv(bits: readonly Pick<Bit, "diameterMm" | "unit" | "label">[]): string {
  const lines = ["diameter,unit,label"];
  for (const bit of bits) {
    const diameter = formatDiameterForExport(bit);
    const unit = bit.unit;
    const label = escapeField(bit.label);
    lines.push(`${diameter},${unit},${label}`);
  }
  // Trailing newline keeps the file POSIX-friendly and is ignored by the parser.
  return `${lines.join("\n")}\n`;
}
