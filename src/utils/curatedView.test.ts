import { describe, it, expect } from 'vitest';
import {
  curatedRowKind,
  suggestionsBySetId,
  curatedPendingStats,
  CONFIDENCE_DISPLAY,
} from './curatedView';
import type { SuggestedTagSpec } from '../api/sampling';

function mkSuggestion(overrides: Partial<SuggestedTagSpec> = {}): SuggestedTagSpec {
  return {
    Id: 'sug-1',
    SimilarSetId: 'set-1',
    MatchKind: 'Untagged',
    Mode: 'Create',
    Confidence: 'HIGH',
    Warnings: null,
    CoverageCount: 44,
    StructuralAnchor: '^TRANSFER TO',
    ExampleTexts: ['TRANSFER TO ACME'],
    ExampleTransactionIds: null,
    SuggestedDefinition: null,
    Status: 'Pending',
    ...overrides,
  };
}

describe('curatedRowKind', () => {
  it('classifies untagged work rows first', () => {
    expect(curatedRowKind({ OpsIsUntagged: true, OpsIsMultiTag: false })).toBe('work-untagged');
  });
  it('classifies multi-tag conflicts', () => {
    expect(curatedRowKind({ OpsIsUntagged: false, OpsIsMultiTag: true })).toBe('work-conflict');
  });
  it('everything else is a reference row', () => {
    expect(curatedRowKind({ OpsIsUntagged: false, OpsIsMultiTag: false, OpsTag: 'CashIn' })).toBe('reference');
    expect(curatedRowKind({})).toBe('reference');
  });
});

describe('suggestionsBySetId', () => {
  it('keys pending suggestions by SimilarSetId', () => {
    const map = suggestionsBySetId([mkSuggestion(), mkSuggestion({ Id: 's2', SimilarSetId: 'set-2' })]);
    expect(map.size).toBe(2);
    expect(map.get('set-1')?.Id).toBe('sug-1');
  });
  it('excludes UNUSABLE grades and non-Pending docs', () => {
    const map = suggestionsBySetId([
      mkSuggestion({ Confidence: 'UNUSABLE' }),
      mkSuggestion({ Id: 's2', SimilarSetId: 'set-2', Status: 'Accepted' }),
      mkSuggestion({ Id: 's3', SimilarSetId: 'set-3', Status: 'Rejected' }),
    ]);
    expect(map.size).toBe(0);
  });
  it('tolerates null input and keeps the first doc per set', () => {
    expect(suggestionsBySetId(null).size).toBe(0);
    const map = suggestionsBySetId([mkSuggestion(), mkSuggestion({ Id: 'dup' })]);
    expect(map.get('set-1')?.Id).toBe('sug-1');
  });
});

describe('curatedPendingStats', () => {
  it('sums pending coverage and counts sets needing a rule', () => {
    const stats = curatedPendingStats([
      mkSuggestion({ CoverageCount: 44 }),
      mkSuggestion({ Id: 's2', SimilarSetId: 'set-2', CoverageCount: 6 }),
      mkSuggestion({ Id: 's3', SimilarSetId: 'set-3', Status: 'Accepted', CoverageCount: 99 }),
      mkSuggestion({ Id: 's4', SimilarSetId: 'set-4', Confidence: 'UNUSABLE', CoverageCount: 5 }),
    ]);
    expect(stats).toEqual({ needRule: 2, covering: 50 });
  });
  it('returns null while suggestions have not loaded', () => {
    expect(curatedPendingStats(null)).toBeNull();
  });
});

describe('CONFIDENCE_DISPLAY', () => {
  it('covers every showable grade with operator wording', () => {
    expect(CONFIDENCE_DISPLAY.HIGH).toBe('Draft ready');
    expect(CONFIDENCE_DISPLAY.MED).toContain('check examples');
    expect(CONFIDENCE_DISPLAY.LOW).toBe('Weak draft');
    expect(CONFIDENCE_DISPLAY.REVIEW).toContain('name');
  });
});
