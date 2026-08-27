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

// --- Transformation Rules ---

export interface TransformationArg {
  Key: string;
  Value: string;
}

export interface TransformationRule {
  Method: string;
  Args: TransformationArg[];
}

// --- Tag Attributes ---

/** Engine behavior on a CONFIRMED LOV miss (extracted text is not an item
 *  tag of the LOV). null / KEEP_TEXT = keep the text and mark the attribute
 *  invalid (legacy behavior); CLEAR_TEXT = drop the text so the attribute
 *  comes out empty and the missing-mandatory/optional flags apply instead.
 *  A transient LOV-service fault always behaves like KEEP_TEXT. */
export type LOVMissBehavior = 'KEEP_TEXT' | 'CLEAR_TEXT';

export interface TagAttribute {
  AttributeTag: string;
  IsMandatory: boolean;
  LOVTag: string | null;
  /** Optional; omitted/null = KEEP_TEXT. Only meaningful with an LOVTag. */
  LOVMissBehavior?: LOVMissBehavior | null;
  ValidationRuleTag: string;
  /**
   * Fixed literal value mode. When non-null, this attribute emits `Constant` as
   * its value for every matching transaction; the backend expects
   * `AttributeRuleExpression` and `Transformations` to be null in that case.
   * When null (the default), the attribute runs a regex-based extraction via
   * `AttributeRuleExpression` + optional `Transformations` pipeline.
   */
  Constant?: string | null;
  AttributeRuleExpression: AttributeRuleExpression | null;
  /**
   * Pre-extraction transformation pipeline. Applied to the raw SourceField
   * value (post-`stringifyFieldValue`) BEFORE the extraction regex runs.
   * Optional: older saved documents that don't carry this field behave as
   * a no-op pipeline. Same shape and runtime as the post-extraction
   * `Transformations` list — pre vs. post is purely a position-in-pipeline
   * distinction.
   */
  PreExtractionTransformations?: TransformationRule[] | null;
  Transformations?: TransformationRule[] | null;
}

// --- Tag Spec Definition ---

export interface TagValidity {
  StartDate: string | null;
  EndDate: string | null;
}

export type StatusTag = 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'INPROGRESS' ;
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
  Id: string | null;
  ActiveTagSpecLibId: string | null;
  OperatorId: string;
  StatusTag: StatusTag;
  DataSetType: string;
  Version: number;
  IsLatestVersion?: boolean;
  VersionDate: string;
  Context: ContextEntry[];
  TagSpecDefinitions: TagSpecDefinition[];
}

// --- Background tagging progress (sibling field of TagSpecLibs in the GetTagSpecLibraries response) ---

export type TaggingProgressStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface TaggingProgressEntry {
  Id: string;
  TagSpecLibraryId: string;
  DataSetType: string;
  TotalTransactions: number;
  ProcessedTransactions: number;
  Status: TaggingProgressStatus;
  StartedAt: string;
  CompletedAt: string | null;
  ErrorMessage: string | null;
  PhaseMessage: string | null;
}

export type TaggingProgressMap = Record<string, TaggingProgressEntry>;

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
