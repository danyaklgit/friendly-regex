import type { TransactionRow } from './transaction';

// --- Context ---

export interface ContextEntry {
  Key: string;
  Value: string;
}

// --- RegexDetails & Language ---

export const DEFAULT_LANGUAGE = 'en';

export interface RegexDetail {
  LanguageCode: string;
  Description: string;
}

export function getContextValue(context: ContextEntry[], key: string): string | undefined {
  return context.find((e) => e.Key === key)?.Value;
}

export function contextMatchesRow(context: ContextEntry[], row: TransactionRow): boolean {
  return context.every((entry) => String(row[entry.Key] ?? '') === entry.Value);
}

export function getRegexDescription(details: RegexDetail[]): string {
  return details?.find((d) => d.LanguageCode === DEFAULT_LANGUAGE)?.Description ?? '';
}

// --- Rule Expressions ---

export interface RuleExpression {
  SourceField: string;
  ExpressionPrompt: string | null;
  ExpressionId: string | null;
  Regex: string;
  RegexDetails: RegexDetail[];
}

/** One AND group: all conditions must match */
export type AndGroup = RuleExpression[];

/** Full rule set: outer = OR, inner = AND */
export type TagRuleExpressions = AndGroup[];

export interface AttributeRuleExpression {
  SourceField: string;
  ExpressionPrompt: string | null;
  ExpressionId: string | null;
  Regex: string;
  RegexDetails: RegexDetail[];
  VerifyValue?: string;
}

// --- Tag Attributes ---

export interface TagAttribute {
  AttributeTag: string;
  IsMandatory: boolean;
  LOVTag: string | null;
  ValidationRuleTag: 'STRING' | 'NUMBER' | 'DATE';
  AttributeRuleExpression: AttributeRuleExpression;
}

// --- Tag Spec Definition ---

export interface TagValidity {
  StartDate: string;
  EndDate: string | null;
}

export type StatusTag = 'ACTIVE' | 'INACTIVE' | 'DRAFT';
export type CertaintyLevelTag = 'HIGH' | 'MEDIUM' | 'LOW';

export interface TagSpecDefinition {
  Id: string;
  Context: ContextEntry[];
  Tag: string;
  StatusTag: StatusTag;
  CertaintyLevelTag: CertaintyLevelTag;
  Validity: TagValidity;
  TagRuleExpressions: TagRuleExpressions;
  Attributes: TagAttribute[];
}

// --- Tag Spec Library (parent container) ---

export interface TagSpecLibrary {
  Id: string;
  ActiveTagSpecLibId: string | null;
  OperatorId: string;
  StatusTag: StatusTag;
  DataSetType: string;
  Version: number;
  IsLatestVersion: boolean;
  VersionDate: string;
  Context: ContextEntry[];
  TagSpecDefinitions: TagSpecDefinition[];
}

// --- Analysis Results ---

export interface RowAnalysisResult {
  tags: string[];
  attributes: Record<string, Record<string, string | null>>;
  matchedDefinitions: TagSpecDefinition[];
}

export interface AnalyzedTransaction {
  row: TransactionRow;
  analysis: RowAnalysisResult;
}
