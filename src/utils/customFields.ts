import type { TransactionRow } from '../types';

/**
 * `CustomFields` — the feed's own named fields (2026-09-09).
 *
 * INTERIM_TransactionsList rows carry the payload's `additionalInformation`
 * bag STRUCTURED as `CustomFields: [{ Key, Value }]` alongside the unchanged
 * flattened ` [_TEP_] ` text in `AdditionalInformation`. The backend
 * addresses one field as `CustomFields:<key>` (the same prefix convention as
 * `OpsAttributes:<tag>`) in filters, rule-condition source fields, and
 * attribute-extraction source fields — see Docs/UI_CustomFields.md.
 *
 * The portal flattens the array onto each row as `CustomFields:<key>` scalar
 * properties at fetch time ({@link flattenCustomFields}, called once in
 * `getTransactions`). Everything downstream then works untouched: field meta
 * derives them from row keys (so they become table columns and source-field
 * options), the local rule engine and attribute extraction read
 * `row[sourceField]`, and the server accepts the exact same name.
 */

export const CUSTOM_FIELD_PREFIX = 'CustomFields:';

/** True for the canonical `CustomFields:<key>` column-name form. */
export function isCustomFieldKey(field: string): boolean {
  return field.startsWith(CUSTOM_FIELD_PREFIX) && field.length > CUSTOM_FIELD_PREFIX.length;
}

/** Display label for a custom field: the bank's own key, verbatim
 *  (`CustomFields:narrative.narr1` → `narrative.narr1`). Non-custom fields
 *  pass through unchanged. */
export function customFieldLabel(field: string): string {
  return isCustomFieldKey(field) ? field.slice(CUSTOM_FIELD_PREFIX.length) : field;
}

/**
 * Flatten each row's `CustomFields` array into `CustomFields:<key>` scalar
 * properties, IN PLACE (rows come fresh from `res.json()`, so mutating is
 * safe and avoids copying a Show-all buffer of tens of thousands of rows).
 * The raw array stays on the row but is object-valued, so `deriveFieldMeta`
 * never surfaces it as a column. Rows without the array (every other
 * DataSetType, pre-backfill rows) are left untouched. A flattened property
 * never overwrites a real row field of the same name — the `CustomFields:`
 * prefix cannot collide with the backend's own property names.
 */
export function flattenCustomFields(rows: TransactionRow[] | undefined | null): void {
  if (!rows) return;
  for (const row of rows) {
    const cf = (row as Record<string, unknown>)['CustomFields'];
    if (!Array.isArray(cf)) continue;
    for (const entry of cf) {
      if (!entry || typeof entry !== 'object') continue;
      const key = (entry as { Key?: unknown }).Key;
      const value = (entry as { Value?: unknown }).Value;
      if (typeof key !== 'string' || key.length === 0) continue;
      row[`${CUSTOM_FIELD_PREFIX}${key}`] =
        value == null ? null : typeof value === 'object' ? JSON.stringify(value) : (value as string | number | boolean);
    }
  }
}
