import type {
  TagContext,
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
  | 'matches_pattern';

export type ExtractionOperation =
  | 'extract_between'
  | 'extract_after'
  | 'extract_before'
  | 'extract_matching';

export interface ConditionFormValue {
  id: string;
  sourceField: string;
  operation: MatchOperation;
  value: string;
  values?: string[];
}

export interface AndGroupFormValue {
  id: string;
  conditions: ConditionFormValue[];
}

export interface AttributeFormValue {
  id: string;
  attributeTag: string;
  isMandatory: boolean;
  dataType: 'STRING' | 'NUMBER' | 'DATE';
  sourceField: string;
  extractionOperation: ExtractionOperation;
  prefix?: string;
  suffix?: string;
  pattern?: string;
}

export interface WizardFormState {
  tag: string;
  context: TagContext;
  statusTag: StatusTag;
  certaintyLevelTag: CertaintyLevelTag;
  validity: TagValidity;
  ruleGroups: AndGroupFormValue[];
  attributes: AttributeFormValue[];
}

export type WizardStep = 1 | 2 | 3 | 4;
