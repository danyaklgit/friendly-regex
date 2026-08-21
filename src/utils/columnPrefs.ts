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

import { settingsStore } from './settingsStore';

const LEGACY_HIDDEN_KEY = 'tep:hiddenColumns';
const LEGACY_ORDER_KEY = 'tep:columnOrder';
const LEGACY_WIDTHS_KEY = 'tep:columnWidths';
const MIGRATION_TARGET_TYPE = 'MT940';

/**
 * Ledger model V2 (2026-08-19): Ledger rows stopped reusing statement fields.
 * These statement-era keys are still SERIALIZED on Ledger rows (the gateway
 * serves some as deprecated aliases), so they exist as columns — but every one
 * of them is in the Ledger `neverShow` set (see transactionColumns LEDGER_SPEC).
 *
 * A never-show key must never be able to HIDE anything. Earlier code RENAMED
 * these aliases to their V2 equivalents on load (StatementId → TransactionId,
 * IBAN → AccountIBAN, …), which mapped a stray alias in the saved hidden-set
 * straight onto a real, default-visible column and hid the operator's applied
 * field — the "column-prefs poison loop" (BUG_Ledger_Column_Prefs_Poison_Loop):
 * apply fields → a later save re-folds the aliases in → next load renames them
 * onto the applied fields → hidden again, forever.
 *
 * Fix: DROP these aliases during the one-time v1→v2 migration instead of
 * renaming them (a genuinely pre-V2 hidden alias just resets to visible once,
 * which is harmless), and the migration runs ONLY when reading a legacy `v1`
 * value — never on every `v2` load. See `columnPrefsKey` (v2) +
 * `migrateColumnPrefsV1ToV2`.
 */
const LEDGER_V2_STATEMENT_ALIASES = new Set([
  'data:StatementId',
  'data:StatementDate',
  'data:IBAN',
  'data:AdditionalInformation',
  'data:TransactionDetails',
  'data:Description1',
  'data:PartyId',
  'data:PartyName',
  'data:BankName',
]);
// RunningBalance: dropped with model V2. AccountCode: dropped with the V2.1
// remap (2026-08-20) — it duplicated AccountNumber and is NULL now.
const LEDGER_V2_DROPPED_KEYS = new Set(['data:RunningBalance', 'data:AccountCode']);

/** v1→v2 transform for one Ledger column key: drop dropped-outright keys and
 *  every statement-era alias (never-show ⇒ can't hide anything); keep the rest
 *  (already-V2 keys pass through). Returns null to drop. */
function migrateLedgerKey(key: string): string | null {
  if (LEDGER_V2_DROPPED_KEYS.has(key)) return null;
  if (LEDGER_V2_STATEMENT_ALIASES.has(key)) return null;
  return key;
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

const PREF_PARTS = ['hidden', 'order', 'widths'] as const;
type PrefPart = (typeof PREF_PARTS)[number];

/** Current (v2) layout key. v2 was introduced to version-stamp the Ledger
 *  migration: the alias drop runs ONCE when a v1 value is read (see
 *  migrateColumnPrefsV1ToV2), never on every load, so a stray alias can no
 *  longer shadow a real column each reload. */
export function columnPrefsKey(dataSetType: string, part: PrefPart): string {
  return `tep:cols:v2:${dataSetType}:${part}`;
}

function legacyV1Key(dataSetType: string, part: PrefPart): string {
  return `tep:cols:v1:${dataSetType}:${part}`;
}

/** Transform a stored v1 value string → its v2 equivalent. Only Ledger changes
 *  (drop statement aliases + dropped-outright keys, dedupe); other types copy
 *  through verbatim. On any parse error the raw value is copied unchanged. */
function migrateV1ValueToV2(dataSetType: string, part: PrefPart, raw: string): string {
  if (dataSetType !== 'Ledger') return raw;
  try {
    if (part === 'widths') {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const next = migrateLedgerKey(key);
        if (next !== null && out[next] === undefined) out[next] = value;
      }
      return JSON.stringify(out);
    }
    // hidden + order are JSON arrays of column keys.
    const parsed = JSON.parse(raw) as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const key of parsed) {
      const next = migrateLedgerKey(key);
      if (next !== null && !seen.has(next)) { seen.add(next); out.push(next); }
    }
    return JSON.stringify(out);
  } catch {
    return raw;
  }
}

/** One-time per-type v1→v2 migration: for each part, if no v2 value exists yet
 *  but a v1 one does, transform it (Ledger alias drop) into v2 and delete the
 *  v1 key. Idempotent — once v2 is written, this no-ops. This is the ONLY place
 *  the Ledger alias transform runs, so it can never re-poison a v2 layout. */
export function migrateColumnPrefsV1ToV2(dataSetType: string): void {
  try {
    for (const part of PREF_PARTS) {
      const v2Key = columnPrefsKey(dataSetType, part);
      if (settingsStore.getItem(v2Key) !== null) continue;
      const v1Key = legacyV1Key(dataSetType, part);
      const v1Val = settingsStore.getItem(v1Key);
      if (v1Val === null) continue;
      settingsStore.setItem(v2Key, migrateV1ValueToV2(dataSetType, part, v1Val));
      settingsStore.removeItem(v1Key);
    }
  } catch { /* ignore storage failures */ }
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
      const legacy = settingsStore.getItem(legacyKey);
      if (legacy === null) continue;
      if (settingsStore.getItem(perTypeKey) === null) {
        settingsStore.setItem(perTypeKey, legacy);
      }
      settingsStore.removeItem(legacyKey);
    }
  } catch { /* ignore storage failures */ }
}

export function loadColumnPrefs(dataSetType: string): ColumnPrefs {
  // v1→v2 first (per-type alias drop wins over the ancient pre-Ledger global),
  // then the legacy global→MT940 adoption fills any still-empty v2 slot.
  migrateColumnPrefsV1ToV2(dataSetType);
  migrateLegacyColumnPrefs();
  let hidden: Set<string> | null = null;
  let order: string[] = [];
  let widths: Record<string, number> = {};
  try {
    const storedHidden = settingsStore.getItem(columnPrefsKey(dataSetType, 'hidden'));
    if (storedHidden) hidden = new Set(JSON.parse(storedHidden) as string[]);
  } catch { hidden = null; }
  try {
    const storedOrder = settingsStore.getItem(columnPrefsKey(dataSetType, 'order'));
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
    const storedWidths = settingsStore.getItem(columnPrefsKey(dataSetType, 'widths'));
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
  // No Ledger transform here: the alias drop already ran once in
  // migrateColumnPrefsV1ToV2 above. Applying it on every load was the poison
  // loop (a re-saved alias got renamed onto a real column each reload).
  return { hidden, order, widths };
}

export function saveHiddenColumns(dataSetType: string, hidden: Set<string> | null): void {
  try {
    const key = columnPrefsKey(dataSetType, 'hidden');
    if (hidden === null) settingsStore.removeItem(key);
    else settingsStore.setItem(key, JSON.stringify([...hidden]));
  } catch { /* ignore */ }
}

export function saveColumnOrder(dataSetType: string, order: string[]): void {
  try {
    const key = columnPrefsKey(dataSetType, 'order');
    if (order.length === 0) settingsStore.removeItem(key);
    else settingsStore.setItem(key, JSON.stringify(order));
  } catch { /* ignore */ }
}

export function saveColumnWidths(dataSetType: string, widths: Record<string, number>): void {
  try {
    const key = columnPrefsKey(dataSetType, 'widths');
    if (Object.keys(widths).length === 0) settingsStore.removeItem(key);
    else settingsStore.setItem(key, JSON.stringify(widths));
  } catch { /* ignore */ }
}
