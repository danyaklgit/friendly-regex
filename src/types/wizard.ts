import type {
  TagValidity,
  StatusTag,
  CertaintyLevelTag,
} from './tagSpec';

export type MatchOperation =
  | 'begins_with'
  | 'ends_with'
  | 'contains'
  | 'does_not_contain'
  | 'does_not_start_with'
  | 'does_not_end_with'
  | 'equals'
  | 'does_not_equal'
  | 'matches_pattern'
  | 'match_regex'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal';

export type ExtractionOperation =
  | 'extract_between'
  | 'extract_after'
  | 'extract_before'
  | 'extract_matching'
  | 'extract_substring'
  | 'extract_last_n_chars'
  | 'extract_skip_take'
  | 'extract_between_and_verify'
  | 'extract_full_field'
  | `predefined:${string}`
  // LOV-driven predefined patterns sourced from the EXTRACTIONS LOV. The part
  // after `lov:` is the LOV item's Value, which IS the regex (per the
  // EXTRACTIONS LOV contract). Selecting one of these hides the prefix/suffix/
  // pattern inputs since the regex carries no params.
  | `lov:${string}`;

export interface ConditionFormValue {
  id: string;
  sourceField: string;
  operation: MatchOperation;
  value: string;
  values?: string[];
  prefix?: string;
  suffix?: string;
  /** Backend RuleExpression id, preserved through the form so the comments
   *  feature can target this rule. Null/undefined for unsaved conditions. */
  _expressionId?: string | null;
}

export interface AndGroupFormValue {
  id: string;
  conditions: ConditionFormValue[];
}

export interface TransformationFormValue {
  id: string;
  method: string;
  args: Record<string, string>;
}

export interface AttributeFormValue {
  id: string;
  attributeTag: string;
  isMandatory: boolean;
  validationRuleTag: string;
  sourceField: string;
  extractionOperation: ExtractionOperation;
  prefix?: string;
  suffix?: string;
  pattern?: string;
  verifyValue?: string;
  lovTag?: string | null;
  isLovBased?: boolean;
  numChars?: number;
  toStr?: string;
  occurrence?: number;
  startingPosition?: number;
  fromPosition?: number;
  toStart?: boolean;
  /**
   * For extract_skip_take: when true, the capture runs to the end of input
   * (`(.*)`) instead of a fixed `numChars` count. Surfaced as the
   * "till end of input" checkbox; mutually exclusive with the take count.
   */
  tillEndOfInput?: boolean;
  prefixOccurrence?: number;
  suffixOccurrence?: number;
  /**
   * For extract_between / extract_before: when true, the saved regex wraps the
   * literal suffix as `(?:<escaped suffix>|$)` so the boundary also matches at
   * end-of-input. Surfaced in the editor as an "or end of input" checkbox.
   */
  suffixOrEndOfInput?: boolean;
  transformations?: TransformationFormValue[];
  /** Original regex from backend — used for preview when round-tripping isn't lossless */
  _originalRegex?: string;
}

export interface WizardFormState {
  tag: string;
  side: string;
  bankSwiftCode: string;
  transactionTypeCode: string;
  statusTag: StatusTag;
  certaintyLevelTag: CertaintyLevelTag;
  validity: TagValidity;
  ruleGroups: AndGroupFormValue[];
  attributes: AttributeFormValue[];
}

export type WizardStep = 1 | 2 | 3 | 4;
