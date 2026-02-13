import type { MatchOperation, ExtractionOperation } from '../types';

export interface MatchOperationDef {
  key: MatchOperation;
  label: string;
  description: string;
  requiresMultipleValues: boolean;
}

export const MATCH_OPERATIONS: MatchOperationDef[] = [
  { key: 'begins_with', label: 'Starts with', description: 'Value starts with the given text', requiresMultipleValues: false },
  { key: 'ends_with', label: 'Ends with', description: 'Value ends with the given text', requiresMultipleValues: false },
  { key: 'contains', label: 'Contains', description: 'Value contains the given text', requiresMultipleValues: false },
  { key: 'does_not_contain', label: 'Does not contain', description: 'Value does not contain the given text', requiresMultipleValues: false },
  { key: 'equals', label: 'Equals', description: 'Value exactly matches the given text', requiresMultipleValues: false },
  { key: 'does_not_equal', label: 'Does not equal', description: 'Value does not match the given text', requiresMultipleValues: false },
  { key: 'matches_pattern', label: 'Matches one of', description: 'Value matches one of the given patterns', requiresMultipleValues: true },
];

export interface ExtractionOperationDef {
  key: ExtractionOperation;
  label: string;
  fields: ('prefix' | 'suffix' | 'pattern')[];
}

export const EXTRACTION_OPERATIONS: ExtractionOperationDef[] = [
  { key: 'extract_between', label: 'Extract between [prefix] and [suffix]', fields: ['prefix', 'suffix'] },
  { key: 'extract_after', label: 'Extract after [prefix]', fields: ['prefix'] },
  { key: 'extract_before', label: 'Extract before [suffix]', fields: ['suffix'] },
  { key: 'extract_matching', label: 'Extract matching pattern', fields: ['pattern'] },
];
