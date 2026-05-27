import type { TagAttribute, TransactionRow } from '../types';
import { applyTransformation } from './transformations';

/**
 * Convert a raw row value to the string the extractor should see.
 *
 * `Amount` is stored as a JavaScript number on the row (e.g. 30000), so
 * `String(value)` drops the trailing-zero decimal that the operator sees
 * in the table (the Debit/Credit columns format with `.toFixed(2)` plus
 * `toLocaleString()` for the commas). Without this normalization, an
 * "Extract full field" on Amount produces "30000" while the table
 * displays "30,000.00" — the decimal precision visible in the UI
 * silently vanishes from the extracted value. Formatting at the
 * extractor boundary means everything downstream (regex matching,
 * transformations, distinct-value popups) sees "30000.00" consistently.
 *
 * Commas from `toLocaleString` are intentionally NOT applied here —
 * they're locale display sugar, not part of the value.
 */
export function stringifyFieldValue(sourceField: string, value: unknown): string {
  if (sourceField === 'Amount' && typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  return String(value);
}

/**
 * Extracts attribute values from a matched transaction row.
 * Returns a record of { attributeTag → extracted value or null }.
 *
 * When no regex is set, uses the raw source field value.
 * After extraction, applies any configured transformations in order.
 */
export function extractAttributes(
  attributes: TagAttribute[],
  row: TransactionRow
): Record<string, string | null> {
  const result: Record<string, string | null> = {};

  for (const attr of attributes) {
    // Constant-mode attribute: emit the literal value verbatim. Skips the
    // source-field lookup, regex engine, and transformation pipeline — none
    // of which apply (AttributeRuleExpression and Transformations are null
    // for these on the wire).
    if (attr.Constant != null) {
      result[attr.AttributeTag] = attr.Constant;
      continue;
    }
    if (!attr.AttributeRuleExpression) {
      result[attr.AttributeTag] = null;
      continue;
    }
    const sourceField = attr.AttributeRuleExpression.SourceField;
    const fieldValue = row[sourceField];
    if (fieldValue === undefined || fieldValue === null) {
      result[attr.AttributeTag] = null;
      continue;
    }

    let extracted: string | null;
    const regexStr = attr.AttributeRuleExpression.Regex;
    const fieldString = stringifyFieldValue(sourceField, fieldValue);

    if (!regexStr) {
      // No extraction method — use the raw source field value
      extracted = fieldString;
    } else {
      try {
        const regex = new RegExp(regexStr);
        const match = fieldString.match(regex);
        // Pick the LAST defined capture group rather than always group 1.
        // - regexify-generated patterns have a single capture group → unchanged
        //   behavior (last group === group 1).
        // - user-authored patterns like `(?:.*?/(.*)){3}(/(.*))` where the
        //   intended value sits in a later/inner group now extract correctly.
        //   In JS, group 1 of that pattern is the LAST iteration of the
        //   repeated `(.*)`, not the desired tail — so always taking [1]
        //   silently returned the wrong segment.
        extracted = null;
        if (match) {
          for (let i = match.length - 1; i >= 1; i--) {
            if (match[i] !== undefined) {
              extracted = match[i];
              break;
            }
          }
        }
      } catch {
        extracted = null;
      }
    }

    // Apply transformation pipeline (array order = execution order)
    if (extracted !== null && attr.Transformations && attr.Transformations.length > 0) {
      for (const t of attr.Transformations) {
        const argsRecord = Object.fromEntries(t.Args.map((a) => [a.Key, a.Value]));
        extracted = applyTransformation(t.Method, argsRecord, extracted);
      }
    }

    result[attr.AttributeTag] = extracted;
  }

  return result;
}
