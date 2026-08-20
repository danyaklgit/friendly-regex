/**
 * Per-DataSetType persistence for the Transactions table column layout
 * (docs/Transactions-Column-Spec.md, Rule 3).
 *
 * Visible-column set, column order, and column widths are each stored PER
 * DataSetType under `tep:cols:v1:<DataSetType>:hidden|order|widths`, replacing
 * the pre-Ledger global `tep:hiddenColumns` / `tep:columnOrder` /
 * `tep:columnWidths` keys. Switching workspaces loads that type's saved
 * layout; changing MT940's layout never affects Ledger's, and vice-versa.
 *
 * Migration: on first load after the change, an existing global preference is
 * adopted as the MT940 layout (the pre-Ledger behavior it was created under),
 * then the global keys are discarded. Other types start from the spec
 * defaults.
 */

const LEGACY_HIDDEN_KEY = 'tep:hiddenColumns';
const LEGACY_ORDER_KEY = 'tep:columnOrder';
const LEGACY_WIDTHS_KEY = 'tep:columnWidths';
const MIGRATION_TARGET_TYPE = 'MT940';

/**
 * Ledger model V2 (2026-08-19): Ledger rows stopped reusing statement fields,
 * so saved Ledger layouts referencing the old column keys are rewritten to the
 * dedicated Ledger field names on load. Applied as a pure transform each load
 * (idempotent — new keys map to themselves by absence), so no write-back pass
 * is needed; the next save persists the migrated keys. RunningBalance is no
 * longer populated on Ledger and is dropped outright.
 */
const LEDGER_V2_KEY_RENAMES: Record<string, string> = {
  'data:StatementId': 'data:TransactionId',
  'data:StatementDate': 'data:PostingDate',
  'data:IBAN': 'data:AccountIBAN',
  'data:AdditionalInformation': 'data:TransactionRef',
  'data:TransactionDetails': 'data:Narrative',
  'data:Description1': 'data:SourceRef',
  'data:PartyId': 'data:CounterPartyCode',
  'data:PartyName': 'data:CounterPartyName',
  'data:BankName': 'data:AccountBankCode',
};
// RunningBalance: dropped with model V2. AccountCode: dropped with the V2.1
// remap (2026-08-20) — it duplicated AccountNumber and is NULL now.
const LEDGER_V2_DROPPED_KEYS = new Set(['data:RunningBalance', 'data:AccountCode']);

function migrateLedgerKey(key: string): string | null {
  if (LEDGER_V2_DROPPED_KEYS.has(key)) return null;
  return LEDGER_V2_KEY_RENAMES[key] ?? key;
}

export interface ColumnPrefs {
  /** Hidden column keys, or null when the operator has no saved preference
   *  (the caller then applies the spec defaults). */
  hidden: Set<string> | null;
  /** Saved drag order; empty when unset (caller applies the spec default). */
  order: string[];
  /** Per-column width overrides in px; empty when unset. */
  widths: Record<string, number>;
}

export function columnPrefsKey(dataSetType: string, part: 'hidden' | 'order' | 'widths'): string {
  return `tep:cols:v1:${dataSetType}:${part}`;
}

/** One-time adoption of the legacy global layout as the MT940 layout. Safe to
 *  call repeatedly — it no-ops once the legacy keys are gone, and it never
 *  overwrites an existing per-type value. */
export function migrateLegacyColumnPrefs(): void {
  try {
    const pairs: Array<[string, string]> = [
      [LEGACY_HIDDEN_KEY, columnPrefsKey(MIGRATION_TARGET_TYPE, 'hidden')],
      [LEGACY_ORDER_KEY, columnPrefsKey(MIGRATION_TARGET_TYPE, 'order')],
      [LEGACY_WIDTHS_KEY, columnPrefsKey(MIGRATION_TARGET_TYPE, 'widths')],
    ];
    for (const [legacyKey, perTypeKey] of pairs) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy === null) continue;
      if (localStorage.getItem(perTypeKey) === null) {
        localStorage.setItem(perTypeKey, legacy);
      }
      localStorage.removeItem(legacyKey);
    }
  } catch { /* ignore storage failures */ }
}

export function loadColumnPrefs(dataSetType: string): ColumnPrefs {
  migrateLegacyColumnPrefs();
  let hidden: Set<string> | null = null;
  let order: string[] = [];
  let widths: Record<string, number> = {};
  try {
    const storedHidden = localStorage.getItem(columnPrefsKey(dataSetType, 'hidden'));
    if (storedHidden) hidden = new Set(JSON.parse(storedHidden) as string[]);
  } catch { hidden = null; }
  try {
    const storedOrder = localStorage.getItem(columnPrefsKey(dataSetType, 'order'));
    if (storedOrder) {
      const parsed = JSON.parse(storedOrder) as string[];
      // Migrate legacy '__dates' grouped-column key → three separate date columns.
      order = parsed.includes('__dates')
        ? parsed.flatMap((key) =>
            key === '__dates' ? ['data:StatementDate', 'data:EntryDate', 'data:ValueDate'] : [key])
        : parsed;
    }
  } catch { order = []; }
  try {
    const storedWidths = localStorage.getItem(columnPrefsKey(dataSetType, 'widths'));
    if (storedWidths) {
      const parsed = JSON.parse(storedWidths);
      if (parsed && typeof parsed === 'object') {
        const cleaned: Record<string, number> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value === 'number' && Number.isFinite(value) && value > 0) cleaned[key] = value;
        }
        widths = cleaned;
      }
    }
  } catch { widths = {}; }
  if (dataSetType === 'Ledger') {
    if (hidden) {
      const migrated = new Set<string>();
      for (const key of hidden) {
        const next = migrateLedgerKey(key);
        if (next !== null) migrated.add(next);
      }
      hidden = migrated;
    }
    if (order.length > 0) {
      const seen = new Set<string>();
      const migrated: string[] = [];
      for (const key of order) {
        const next = migrateLedgerKey(key);
        if (next !== null && !seen.has(next)) {
          seen.add(next);
          migrated.push(next);
        }
      }
      order = migrated;
    }
    const widthEntries = Object.entries(widths);
    if (widthEntries.length > 0) {
      const migrated: Record<string, number> = {};
      for (const [key, value] of widthEntries) {
        const next = migrateLedgerKey(key);
        // First writer wins on a collision (an old key never collides with a
        // distinct new key in practice — renames map 1:1).
        if (next !== null && migrated[next] === undefined) migrated[next] = value;
      }
      widths = migrated;
    }
  }
  return { hidden, order, widths };
}

export function saveHiddenColumns(dataSetType: string, hidden: Set<string> | null): void {
  try {
    const key = columnPrefsKey(dataSetType, 'hidden');
    if (hidden === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify([...hidden]));
  } catch { /* ignore */ }
}

export function saveColumnOrder(dataSetType: string, order: string[]): void {
  try {
    const key = columnPrefsKey(dataSetType, 'order');
    if (order.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(order));
  } catch { /* ignore */ }
}

export function saveColumnWidths(dataSetType: string, widths: Record<string, number>): void {
  try {
    const key = columnPrefsKey(dataSetType, 'widths');
    if (Object.keys(widths).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(widths));
  } catch { /* ignore */ }
}
