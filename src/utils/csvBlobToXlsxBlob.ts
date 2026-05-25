/**
 * Converts a CSV `Blob` (as returned by the backend `DownloadMT940Transactions`
 * endpoint) into an `.xlsx` workbook `Blob` ready for `downloadBlob`. The
 * `xlsx` library (SheetJS) is loaded via dynamic `import()` so it only ships
 * in a lazy chunk — operators who never use Download Center never pay for it.
 *
 * Per the API doc the backend CSV is UTF-8, comma-delimited, with a header
 * row at line 1. JSON-blob columns (Hints, OpsAttributes, OpsMultiTags,
 * Attributes, MultiTags) come through as quoted JSON strings; SheetJS keeps
 * them as plain text cells, which is what we want (Excel renders the JSON
 * as a long string in the cell, no parsing surprises).
 */
export async function csvBlobToXlsxBlob(csvBlob: Blob): Promise<Blob> {
  const text = await csvBlob.text();
  const XLSX = await import('xlsx');
  // `cellDates: false` keeps ISO timestamp strings as strings rather than
  // attempting to parse them into JS Dates — the backend already serialises
  // them in ISO 8601, and Excel will recognise that format when it opens the
  // file. Parsing them to Dates would risk timezone drift.
  const workbook = XLSX.read(text, { type: 'string', cellDates: false });
  const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Renames `foo.csv` -> `foo.xlsx`. Leaves any other extension alone. */
export function csvFilenameToXlsx(filename: string): string {
  return filename.replace(/\.csv$/i, '.xlsx');
}
