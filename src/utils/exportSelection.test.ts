import { describe, it, expect } from 'vitest';
import {
  normalizeKeyRule,
  normalizeAttributeRule,
  normalizeSelection,
  selectionsEquivalent,
  selectionExportsNothing,
} from './exportSelection';
import type { ExportColumnSelection } from '../types/downloadCenter';

describe('normalizeKeyRule / normalizeAttributeRule', () => {
  it('defaults an absent rule to All with no keys', () => {
    expect(normalizeKeyRule(undefined)).toEqual({ Mode: 'All', Keys: [] });
    expect(normalizeAttributeRule(undefined)).toEqual({ Mode: 'All', Keys: [], Json: true });
  });

  it('canonicalises mode casing and drops keys outside Listed', () => {
    expect(normalizeKeyRule({ Mode: 'listed' as never, Keys: ['a', 'b'] })).toEqual({ Mode: 'Listed', Keys: ['a', 'b'] });
    expect(normalizeKeyRule({ Mode: 'NONE' as never, Keys: ['stale'] })).toEqual({ Mode: 'None', Keys: [] });
    expect(normalizeKeyRule({ Mode: 'bogus' as never })).toEqual({ Mode: 'All', Keys: [] });
  });

  it('keeps an explicit Json false', () => {
    expect(normalizeAttributeRule({ Mode: 'All', Json: false }).Json).toBe(false);
  });
});

describe('selectionsEquivalent', () => {
  const base: ExportColumnSelection = {
    Columns: ['StatementDate', 'Amount'],
    CustomFields: { Mode: 'All' },
    OpsAttributes: { Mode: 'Listed', Keys: ['IBAN'], Json: false },
    Attributes: { Mode: 'None' },
  };

  it('treats implicit and explicit defaults as equal', () => {
    expect(selectionsEquivalent(
      { Columns: ['A'] },
      { Columns: ['A'], CustomFields: { Mode: 'All', Keys: [] }, OpsAttributes: { Mode: 'All', Json: true }, Attributes: { Mode: 'All' } },
    )).toBe(true);
  });

  it('is order-sensitive on Columns and Listed keys', () => {
    expect(selectionsEquivalent(base, { ...base, Columns: ['Amount', 'StatementDate'] })).toBe(false);
    expect(selectionsEquivalent(base, { ...base, OpsAttributes: { Mode: 'Listed', Keys: ['IBAN', 'X'], Json: false } })).toBe(false);
  });

  it('detects mode / Json edits', () => {
    expect(selectionsEquivalent(base, { ...base, CustomFields: { Mode: 'None' } })).toBe(false);
    expect(selectionsEquivalent(base, { ...base, OpsAttributes: { Mode: 'Listed', Keys: ['IBAN'], Json: true } })).toBe(false);
  });

  it('ignores Recommendations — the live flags win at export time', () => {
    expect(selectionsEquivalent(
      { ...base, Recommendations: { Include: true, MatchTransactionType: true } },
      { ...base, Recommendations: { Include: false, MatchTransactionType: false } },
    )).toBe(true);
  });
});

describe('selectionExportsNothing', () => {
  it('flags the all-empty selection', () => {
    expect(selectionExportsNothing({
      Columns: [],
      CustomFields: { Mode: 'None' },
      OpsAttributes: { Mode: 'None', Json: false },
      Attributes: { Mode: 'Listed', Keys: [], Json: false },
    })).toBe(true);
  });

  it('any fixed column, dynamic key, or JSON column rescues it', () => {
    const empty: ExportColumnSelection = {
      Columns: [],
      CustomFields: { Mode: 'None' },
      OpsAttributes: { Mode: 'None', Json: false },
      Attributes: { Mode: 'None', Json: false },
    };
    expect(selectionExportsNothing({ ...empty, Columns: ['Id'] })).toBe(false);
    expect(selectionExportsNothing({ ...empty, CustomFields: { Mode: 'All' } })).toBe(false);
    expect(selectionExportsNothing({ ...empty, CustomFields: { Mode: 'Listed', Keys: ['uniqueId'] } })).toBe(false);
    expect(selectionExportsNothing({ ...empty, OpsAttributes: { Mode: 'None', Json: true } })).toBe(false);
    expect(selectionExportsNothing({ ...empty, Attributes: { Mode: 'Listed', Keys: ['IBAN'], Json: false } })).toBe(false);
  });

  it('a default (all-implicit) selection exports everything, not nothing', () => {
    expect(selectionExportsNothing(undefined)).toBe(false);
    expect(selectionExportsNothing({})).toBe(false);
  });
});

describe('normalizeSelection', () => {
  it('copies arrays so working state never aliases the profile object', () => {
    const sel: ExportColumnSelection = { Columns: ['A'], CustomFields: { Mode: 'Listed', Keys: ['k'] } };
    const n = normalizeSelection(sel);
    n.Columns.push('B');
    n.CustomFields.Keys.push('x');
    expect(sel.Columns).toEqual(['A']);
    expect(sel.CustomFields?.Keys).toEqual(['k']);
  });
});
