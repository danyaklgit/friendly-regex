import type { MatchOperation, ExtractionOperation } from '../types';

export interface MatchOperationDef {
  key: MatchOperation;
  label: string;
  description: string;
  requiresMultipleValues: boolean;
  requiresExtraction?: boolean;
}

export const MATCH_OPERATIONS: MatchOperationDef[] = [
  { key: 'begins_with', label: 'Starts with', description: 'Value starts with the given text', requiresMultipleValues: false },
  { key: 'ends_with', label: 'Ends with', description: 'Value ends with the given text', requiresMultipleValues: false },
  { key: 'contains', label: 'Contains', description: 'Value contains the given text', requiresMultipleValues: false },
  { key: 'does_not_contain', label: 'Does not contain', description: 'Value does not contain the given text', requiresMultipleValues: false },
  { key: 'equals', label: 'Equals', description: 'Value exactly matches the given text', requiresMultipleValues: false },
  { key: 'does_not_equal', label: 'Does not equal', description: 'Value does not match the given text', requiresMultipleValues: false },
  { key: 'matches_pattern', label: 'Matches one of', description: 'Value matches one of the given patterns', requiresMultipleValues: true },
  { key: 'extract_and_compare', label: 'Extract between and compare', description: 'Extract text between prefix and suffix, then compare to a value', requiresMultipleValues: false, requiresExtraction: true },
];

export interface ExtractionOperationDef {
  key: ExtractionOperation;
  label: string;
  fields: ('prefix' | 'suffix' | 'pattern' | 'verifyValue')[];
}

/** Predefined regex patterns that require no user input fields. */
export interface PredefinedPatternDef {
  key: `predefined:${string}`;
  label: string;
  regex: string;
  /** When true, cells show a checkmark/X indicating whether the source field matches the regex. */
  validate: boolean;
}

export const PREDEFINED_PATTERNS: PredefinedPatternDef[] = [
  { key: 'predefined:ksa_iban', label: 'Verify KSA IBAN', regex: '(SA\\d{22})', validate: true },
];

export const EXTRACTION_OPERATIONS: ExtractionOperationDef[] = [
  ...PREDEFINED_PATTERNS.map((p) => ({ key: p.key as ExtractionOperation, label: p.label, fields: [] as ('prefix' | 'suffix' | 'pattern')[] })),
  { key: 'extract_between', label: 'Extract between [prefix] and [suffix]', fields: ['prefix', 'suffix'] },
  { key: 'extract_after', label: 'Extract after [prefix]', fields: ['prefix'] },
  { key: 'extract_before', label: 'Extract before [suffix]', fields: ['suffix'] },
  { key: 'extract_matching', label: 'Extract matching pattern', fields: ['pattern'] },
  { key: 'extract_between_and_verify', label: 'Extract between [prefix] and [suffix] and verify', fields: ['prefix', 'suffix', 'verifyValue']},
];
