/**
 * Redaction rules applied to the Description column in the user-mode portal.
 *
 * Two rule kinds:
 *   - `between`: replace the entire span from `prefix` through `suffix` (delimiters
 *     included) with `replacement`. Example: `/ORDP/Alice/`  →  `*****OrderingPty*****`.
 *   - `regex`:   standard JS regex replace. `flags` default to `'g'` so all matches
 *     in the cell are masked.
 *
 * Rules are applied in array order; later rules see already-redacted text. Keep the
 * tighter / more specific patterns first to avoid double-redaction artifacts.
 *
 * This file is bundled. To change the rule set we redeploy — the user-mode portal
 * is demo-driven and the rule list is small enough that build-time bundling beats
 * an extra API call. If/when this grows past ~50 rules consider lifting into the
 * LOV catalog (e.g. `DEMO_USER_REDACTIONS`).
 *
 * `REDACTION_BYPASS_PASSWORD` is a hard-coded gate for the redaction toggle. It is
 * NOT a security control — it ships in the JS bundle and any user can read it from
 * devtools. Treat it as a deliberate-friction affordance, not authentication.
 */

export type RedactionRule =
  | {
      kind: 'between';
      name: string;
      prefix: string;
      suffix: string;
      replacement: string;
    }
  | {
      kind: 'regex';
      name: string;
      pattern: string;
      flags?: string;
      replacement: string;
    };

export const REDACTION_RULES: RedactionRule[] = [
  // Saudi IBANs with optional whitespace between digit/char groups
  // (e.g. "SA 6810 0000 6251 35 47 0001 00" → "SA****************")
  {
    kind: 'regex',
    name: 'KSAIBAN',
    pattern: '(?<![A-Z0-9])SA(?:\\s*\\d){4}(?:\\s*[A-Z0-9]){18}(?![A-Z0-9])',
    replacement: 'SA****************',
  },
  // Generic IBAN catch-all (any country)
  {
    kind: 'regex',
    name: 'IBAN',
    pattern: '\\b[A-Z]{2}\\d{2}[A-Z0-9]{11,30}\\b',
    replacement: 'XX****************',
  },
  // MT940 narrative sub-fields delimited by slashes
  { kind: 'between', name: 'ANBAccNo', prefix: '/IBAN/', suffix: '/', replacement: '*****AcctNumber*****' },
  { kind: 'between', name: 'ANBOrdP', prefix: '/ORDP/', suffix: '/', replacement: '*****OrderingPty*****' },
  { kind: 'between', name: 'ANBBenM', prefix: '/BENM/', suffix: '/', replacement: '*****Beneficiary*****' },
  // { kind: 'between', name: 'test', prefix: 'INV', suffix: '/PD', replacement: '*****testdan*****' },
];

/**
 * Demo-mode gate for turning OFF redaction on the description column. NOT a
 * security control — see file header.
 */
export const REDACTION_BYPASS_PASSWORD = '123123';
