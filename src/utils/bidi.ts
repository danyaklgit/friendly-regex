/**
 * Bidirectional-text helpers.
 *
 * Transaction narratives (notably `AdditionalInformation`) mix Arabic
 * (right-to-left) with English/numbers (left-to-right). Extraction and the
 * position-based transformations operate on the LOGICAL (stored) character
 * order, but the browser renders mixed text in VISUAL order, so operators
 * can't tell where a split lands. `containsRtl` lets the UI detect those
 * values and surface a logical-order aid (see CharacterBreakdown).
 */

// Strong RTL Unicode blocks expected in bank narratives. Tested by code point
// (numeric, ASCII-only source — no literal RTL glyphs) so no irregular
// whitespace or regex-literal pitfalls. All are in the BMP, so UTF-16 code
// units from charCodeAt are sufficient.
const RTL_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic Supplement
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb1d, 0xfdff], // Hebrew + Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
];

/** True if the string contains any right-to-left (Arabic/Hebrew) character. */
export function containsRtl(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    for (const [lo, hi] of RTL_RANGES) {
      if (c >= lo && c <= hi) return true;
    }
  }
  return false;
}
