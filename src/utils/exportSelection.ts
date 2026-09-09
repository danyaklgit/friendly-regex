import type {
  ExportAttributeRule,
  ExportColumnSelection,
  ExportKeyRule,
  ExportKeyRuleMode,
  ExportRecommendationRule,
} from '../types/downloadCenter';

/**
 * Pure helpers for the export prompt (export profiles, API ref §9.1c).
 *
 * A profile's stored selection and the prompt's working selection are both
 * `ExportColumnSelection`, but the backend leaves defaults implicit (rule
 * modes default to `All`, `Json` to true, recommendation flags to true).
 * Normalising both sides first makes "has the operator edited the selected
 * profile?" a plain deep-compare, which is what decides whether the export
 * sends `ProfileId` (pristine) or an ad-hoc `Selection` (edited, unsaved).
 */

export interface NormalizedKeyRule {
  Mode: ExportKeyRuleMode;
  Keys: string[];
}

export interface NormalizedAttributeRule extends NormalizedKeyRule {
  Json: boolean;
}

export interface NormalizedSelection {
  Columns: string[];
  CustomFields: NormalizedKeyRule;
  OpsAttributes: NormalizedAttributeRule;
  Attributes: NormalizedAttributeRule;
  Recommendations: Required<ExportRecommendationRule>;
}

const KEY_RULE_MODES: ReadonlySet<string> = new Set(['All', 'None', 'Listed']);

function normalizeMode(mode: string | undefined): ExportKeyRuleMode {
  // The backend is case-insensitive on input but stores the canonical
  // spelling; tolerate either on read.
  if (!mode) return 'All';
  const canonical = mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
  return KEY_RULE_MODES.has(canonical) ? (canonical as ExportKeyRuleMode) : 'All';
}

export function normalizeKeyRule(rule: ExportKeyRule | undefined): NormalizedKeyRule {
  const mode = normalizeMode(rule?.Mode);
  return { Mode: mode, Keys: mode === 'Listed' ? [...(rule?.Keys ?? [])] : [] };
}

export function normalizeAttributeRule(rule: ExportAttributeRule | undefined): NormalizedAttributeRule {
  return { ...normalizeKeyRule(rule), Json: rule?.Json ?? true };
}

export function normalizeSelection(sel: ExportColumnSelection | undefined): NormalizedSelection {
  return {
    Columns: [...(sel?.Columns ?? [])],
    CustomFields: normalizeKeyRule(sel?.CustomFields),
    OpsAttributes: normalizeAttributeRule(sel?.OpsAttributes),
    Attributes: normalizeAttributeRule(sel?.Attributes),
    Recommendations: {
      Include: sel?.Recommendations?.Include ?? true,
      MatchTransactionType: sel?.Recommendations?.MatchTransactionType ?? true,
    },
  };
}

function keyRulesEqual(a: NormalizedKeyRule, b: NormalizedKeyRule): boolean {
  return a.Mode === b.Mode && a.Keys.length === b.Keys.length && a.Keys.every((k, i) => k === b.Keys[i]);
}

/**
 * Column-content equality between two selections — the prompt's dirty check.
 * Order-sensitive on `Columns` and on `Listed` keys (both are output order).
 * `Recommendations` is deliberately EXCLUDED: the prompt's recommendation
 * row mirrors the workspace's live toggles, which are sent as the top-level
 * export flags and WIN over any stored rule, so a toggle flip alone never
 * makes a profile "edited".
 */
export function selectionsEquivalent(
  a: ExportColumnSelection | undefined,
  b: ExportColumnSelection | undefined,
): boolean {
  const na = normalizeSelection(a);
  const nb = normalizeSelection(b);
  return (
    na.Columns.length === nb.Columns.length &&
    na.Columns.every((c, i) => c === nb.Columns[i]) &&
    keyRulesEqual(na.CustomFields, nb.CustomFields) &&
    keyRulesEqual(na.OpsAttributes, nb.OpsAttributes) &&
    na.OpsAttributes.Json === nb.OpsAttributes.Json &&
    keyRulesEqual(na.Attributes, nb.Attributes) &&
    na.Attributes.Json === nb.Attributes.Json
  );
}

function keyRuleYieldsNothing(rule: NormalizedKeyRule): boolean {
  return rule.Mode === 'None' || (rule.Mode === 'Listed' && rule.Keys.length === 0);
}

/**
 * True when the selection would put NO column in the file: no fixed columns,
 * custom fields yielding nothing, and both attribute blocks yielding nothing
 * without their JSON column. The backend refuses such a save with 400;
 * Save / Export are disabled client-side with "Pick at least one column".
 * (Recommendation columns alone don't count — they only exist on intraday
 * rows and hang off the attribute columns.)
 */
export function selectionExportsNothing(sel: ExportColumnSelection | undefined): boolean {
  const n = normalizeSelection(sel);
  const attrBlockEmpty = (rule: NormalizedAttributeRule) => keyRuleYieldsNothing(rule) && !rule.Json;
  return (
    n.Columns.length === 0 &&
    keyRuleYieldsNothing(n.CustomFields) &&
    attrBlockEmpty(n.OpsAttributes) &&
    attrBlockEmpty(n.Attributes)
  );
}
