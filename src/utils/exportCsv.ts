import { downloadBlob } from './downloadBlob';

/**
 * Minimal CSV export helpers for client-side data already loaded in the app
 * (e.g. the Settings Extractions / LOVs tables). The backend owns the
 * transactions export; these reference-data lists have no export endpoint, so
 * we build the CSV in the browser and hand it to `downloadBlob`.
 *
 * CSV (not XLSX) keeps it dependency-free and Excel-friendly — the same
 * `text/csv` the backend emits. A UTF-8 BOM is prepended on download so Excel
 * renders Arabic / non-ASCII values correctly.
 */

// UTF-8 byte-order mark (U+FEFF) built from its code point so no literal
// invisible character lands in source (which would trip no-irregular-whitespace).
const BOM = String.fromCharCode(0xfeff);

/** Quote a field when it contains a comma, quote, or newline; escape quotes. */
function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

type Cell = string | number | null | undefined;

/** Build a CSV string (CRLF line endings) from a header row + data rows. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const render = (cells: Cell[]) =>
    cells.map((c) => escapeCsvField(c == null ? '' : String(c))).join(',');
  return [render(headers), ...rows.map(render)].join('\r\n');
}

/** Build the CSV and trigger a browser download (with a UTF-8 BOM for Excel). */
export function downloadCsv(filename: string, headers: string[], rows: Cell[][]): void {
  const blob = new Blob([BOM, toCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}
