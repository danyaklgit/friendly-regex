/**
 * Generate a fresh 7-digit numeric string for the user-mode "JV/Document Number"
 * column. The leading digit is 1-9 (no leading zero) so the rendered string
 * always reads as a 7-digit number, not a 6-digit one with a stray zero in
 * front.
 *
 * Demo column — re-rolls on every row mount per `useMemo([])`.
 */
export function randomJv(): string {
  const first = Math.floor(Math.random() * 9) + 1; // 1-9
  let out = String(first);
  for (let i = 0; i < 6; i++) {
    out += Math.floor(Math.random() * 10);
  }
  return out;
}
