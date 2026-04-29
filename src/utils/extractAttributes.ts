import type { TagAttribute, TransactionRow } from '../types';
import { applyTransformation } from './transformations';

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
    const fieldValue = row[attr.AttributeRuleExpression.SourceField];
    if (fieldValue === undefined || fieldValue === null) {
      result[attr.AttributeTag] = null;
      continue;
    }

    let extracted: string | null;
    const regexStr = attr.AttributeRuleExpression.Regex;

    if (!regexStr) {
      // No extraction method — use the raw source field value
      extracted = String(fieldValue);
    } else {
      try {
        const regex = new RegExp(regexStr);
        const match = String(fieldValue).match(regex);
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
