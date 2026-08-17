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
  | 'less_than_or_equal'
  | 'is_blank_or_empty'
  | 'is_not_blank_or_empty';

export type ExtractionOperation =
  | 'extract_between'
  | 'extract_after'
  | 'extract_before'
  | 'extract_matching'
  | 'extract_substring'
  | 'extract_last_n_chars'
  | 'extract_skip_take'
  | 'extract_from_start'
  | 'extract_from_end'
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
  /**
   * "Is Constant" mode: when true, the attribute emits `constantValue` as a
   * fixed literal for every matching transaction. The extraction op, source
   * field, transformations, and validation are all ignored at save time and
   * hidden in the editor. Mutually exclusive with `isLovBased`.
   */
  isConstant?: boolean;
  /** Literal value emitted when `isConstant` is true. */
  constantValue?: string;
  /**
   * Pre-extraction transformation pipeline. Applied to the raw SourceField
   * value before the extraction regex runs. Same shape as the post-extraction
   * `transformations` list — they share the runtime, the completeness gate,
   * and the method catalog; only the position in the pipeline differs.
   */
  preExtractionTransformations?: TransformationFormValue[];
  transformations?: TransformationFormValue[];
  /** Original regex from backend — used for preview when round-tripping isn't lossless */
  _originalRegex?: string;
}

export interface WizardFormState {
  tag: string;
  side: string;
  bankSwiftCode: string;
  /** DataSetType of the workspace the rule is authored in. Drives the parent
   *  Context shape at save (Ledger uses ClientCode/ErpCode, not bank/side) and
   *  the Basic Info step's identity display. */
  dataSetType: string;
  /** Ledger identity — '' for bank/side workspaces. */
  clientCode: string;
  erpCode: string;
  transactionTypeCode: string;
  statusTag: StatusTag;
  certaintyLevelTag: CertaintyLevelTag;
  validity: TagValidity;
  ruleGroups: AndGroupFormValue[];
  attributes: AttributeFormValue[];
}

export type WizardStep = 1 | 2 | 3 | 4;
