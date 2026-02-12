import type { TransactionRow, TagSpecDefinition, RowAnalysisResult } from '../types';
import { evaluateRuleSet } from './evaluateRuleSet';
import { extractAttributes } from './extractAttributes';

/**
 * Checks all tag rules against a transaction row.
 * Returns matched tags and their extracted attributes.
 */
export function analyzeRow(
  row: TransactionRow,
  tagDefinitions: TagSpecDefinition[]
): RowAnalysisResult {
  const tags: string[] = [];
  const attributes: Record<string, Record<string, string | null>> = {};
  const matchedDefinitions: TagSpecDefinition[] = [];

  for (const def of tagDefinitions) {
    if (def.StatusTag !== 'ACTIVE') continue;

    const now = new Date().toISOString().split('T')[0];
    if (def.Validity.StartDate && now < def.Validity.StartDate) continue;
    if (def.Validity.EndDate && now > def.Validity.EndDate) continue;

    // OR logic: any AND group matching is sufficient
    const matches = def.TagRuleExpressions.some((andGroup) =>
      evaluateRuleSet(andGroup, row)
    );

    if (matches) {
      tags.push(def.Tag);
      matchedDefinitions.push(def);
      attributes[def.Tag] = extractAttributes(def.Attributes, row);
    }
  }

  return { tags, attributes, matchedDefinitions };
}
