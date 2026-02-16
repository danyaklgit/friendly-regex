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
  | 'equals'
  | 'does_not_equal'
  | 'matches_pattern'
  | 'extract_and_compare'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal';

export type ExtractionOperation =
  | 'extract_between'
  | 'extract_after'
  | 'extract_before'
  | 'extract_matching'
  | 'extract_between_and_verify'
  | `predefined:${string}`;

export interface ConditionFormValue {
  id: string;
  sourceField: string;
  operation: MatchOperation;
  value: string;
  values?: string[];
  prefix?: string;
  suffix?: string;
}

export interface AndGroupFormValue {
  id: string;
  conditions: ConditionFormValue[];
}

export interface AttributeFormValue {
  id: string;
  attributeTag: string;
  isMandatory: boolean;
  validationRuleTag: 'STRING' | 'NUMBER' | 'DATE';
  sourceField: string;
  extractionOperation: ExtractionOperation;
  prefix?: string;
  suffix?: string;
  pattern?: string;
  verifyValue?: string;
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
