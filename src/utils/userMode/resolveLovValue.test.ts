import { describe, it, expect } from 'vitest';
import { buildAttrLovTagMap, resolveLovValue, type LovLookup } from './resolveLovValue';
import type { BackendAttribute } from '../../types/lov';

function attr(value: string, lov: string | null): BackendAttribute {
  return { Id: 1, Value: value, StatusTag: 'ACTIVE', StatusName: null, PossibleLOVTag: lov, Details: [] };
}

const lovLookup: LovLookup = new Map([
  ['BANKS', new Map([['NCBKSAJE', 'Saudi National Bank']])],
  ['SADAD_BILLERS', new Map([['001', 'National Water Company']])],
  // squashed key variant, as lovLookup also indexes
  ['countries', new Map([['SA', 'Saudi Arabia']])],
]);

describe('buildAttrLovTagMap', () => {
  it('maps lowercased attribute name to its PossibleLOVTag', () => {
    const map = buildAttrLovTagMap([attr('BillerCode', 'SADAD_BILLERS'), attr('Note', null)]);
    expect(map.get('billercode')).toBe('SADAD_BILLERS');
    expect(map.has('note')).toBe(false);
  });

  it('keeps the first mapping when a name repeats', () => {
    const map = buildAttrLovTagMap([attr('X', 'BANKS'), attr('X', 'COUNTRIES')]);
    expect(map.get('x')).toBe('BANKS');
  });
});

describe('resolveLovValue', () => {
  const map = buildAttrLovTagMap([attr('BillerName', 'SADAD_BILLERS')]);

  it('resolves a catalog-mapped attribute via its LOV', () => {
    expect(resolveLovValue('BillerName', '001', lovLookup, map)).toBe('National Water Company');
  });

  it('falls back to the heuristic for bank-like names without a catalog entry', () => {
    expect(resolveLovValue('BeneficiaryBank', 'NCBKSAJE', lovLookup, new Map())).toBe('Saudi National Bank');
  });

  it('falls back to the heuristic for biller-like names', () => {
    expect(resolveLovValue('Biller', '001', lovLookup, new Map())).toBe('National Water Company');
  });

  it('returns the raw value for non-LOV attributes', () => {
    expect(resolveLovValue('FreeText', 'hello', lovLookup, new Map())).toBe('hello');
  });

  it('returns the raw value when the code is not in the LOV', () => {
    expect(resolveLovValue('BeneficiaryBank', 'UNKNOWN', lovLookup, new Map())).toBe('UNKNOWN');
  });

  it('returns empty input unchanged', () => {
    expect(resolveLovValue('BeneficiaryBank', '', lovLookup, new Map())).toBe('');
  });

  it('trims the value before lookup', () => {
    expect(resolveLovValue('BeneficiaryBank', '  NCBKSAJE  ', lovLookup, new Map())).toBe('Saudi National Bank');
  });

  it('passes a code-shaped attribute through unresolved even when the heuristic matches', () => {
    // SadadBillerCode contains "biller" so the heuristic would otherwise
    // hit SADAD_BILLERS and replace the code with the friendly name,
    // making the displayed "Sadad Biller Code" cell read identical to
    // the "Sadad Biller Name" cell beside it.
    expect(resolveLovValue('SadadBillerCode', '001', lovLookup, new Map())).toBe('001');
  });

  it('passes a code-shaped attribute through unresolved even when the catalog explicitly maps it', () => {
    // Catalog deliberately pairs SadadBillerCode with SADAD_BILLERS so
    // operator-mode can show the resolved name on hover; user-mode
    // surfaces Code AND Name side by side, so the Code label must
    // stay raw.
    const catalogMap = buildAttrLovTagMap([attr('SadadBillerCode', 'SADAD_BILLERS')]);
    expect(resolveLovValue('SadadBillerCode', '001', lovLookup, catalogMap)).toBe('001');
  });

  it('still resolves the matching Name attribute', () => {
    // Companion check: SadadBillerName resolves via the heuristic so the
    // friendly name is what the user sees on that row.
    expect(resolveLovValue('SadadBillerName', '001', lovLookup, new Map())).toBe('National Water Company');
  });
});
