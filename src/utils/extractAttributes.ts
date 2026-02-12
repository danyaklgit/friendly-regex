import type { TagAttribute, TransactionRow } from '../types';

/**
 * Extracts attribute values from a matched transaction row.
 * Returns a record of { attributeTag → extracted value or null }.
 */
export function extractAttributes(
  attributes: TagAttribute[],
  row: TransactionRow
): Record<string, string | null> {
  const result: Record<string, string | null> = {};

  for (const attr of attributes) {
    const fieldValue = row[attr.AttributeRuleExpression.SourceField];
    if (!fieldValue) {
      result[attr.AttributeTag] = null;
      continue;
    }
    try {
      const regex = new RegExp(attr.AttributeRuleExpression.Regex);
      const match = fieldValue.match(regex);
      result[attr.AttributeTag] = match?.[1] ?? null;
    } catch {
      result[attr.AttributeTag] = null;
    }
  }

  return result;
}
