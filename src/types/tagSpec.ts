export interface RuleExpression {
  SourceField: string;
  ExpressionPrompt: string;
  ExpressionId: string | null;
  Regex: string;
}

/** One AND group: all conditions must match */
export type AndGroup = RuleExpression[];

/** Full rule set: outer = OR, inner = AND */
export type TagRuleExpressions = AndGroup[];

export interface AttributeRuleExpression {
  SourceField: string;
  ExpressionPrompt: string;
  ExpressionId: string;
  Regex: string;
}

export interface TagAttribute {
  AttributeTag: string;
  IsMandatory: boolean;
  DataType: 'STRING' | 'NUMBER' | 'DATE';
  AttributeRuleExpression: AttributeRuleExpression;
}

export interface TagContext {
  Side: string;
  TxnType: string;
}

export interface TagValidity {
  StartDate: string;
  EndDate: string | null;
}

export type StatusTag = 'ACTIVE' | 'INACTIVE' | 'DRAFT';
export type CertaintyLevelTag = 'HIGH' | 'MEDIUM' | 'LOW';

export interface TagSpecDefinition {
  Id: number;
  Context: TagContext;
  Tag: string;
  StatusTag: StatusTag;
  CertaintyLevelTag: CertaintyLevelTag;
  Validity: TagValidity;
  TagRuleExpressions: TagRuleExpressions;
  Attributes: TagAttribute[];
}

export interface TagSpecData {
  TagSpecDefinitions: TagSpecDefinition[];
}

export interface RowAnalysisResult {
  tags: string[];
  attributes: Record<string, Record<string, string | null>>;
  matchedDefinitions: TagSpecDefinition[];
}
