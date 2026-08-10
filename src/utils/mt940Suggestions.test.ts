import { describe, it, expect } from 'vitest';
import type { TagSpecDefinition, TransactionRow } from '../types';
import { regexify } from './regexify';
import { matchingMt940Defs } from './mt940Suggestions';

function def(
  id: string,
  tag: string,
  overrides: Partial<TagSpecDefinition> = {},
): TagSpecDefinition {
  return {
    Id: id,
    Tag: tag,
    Context: [],
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'HIGH',
    Validity: { StartDate: null, EndDate: null },
    TagRuleExpressions: [
      [
        {
          SourceField: 'AdditionalInformation',
          ExpressionPrompt: null,
          ExpressionId: null,
          Regex: regexify('contains', 'SARIE'),
          RegexDetails: [],
        },
      ],
    ],
    Attributes: [],
    ...overrides,
  };
}

const row: TransactionRow = { AdditionalInformation: 'Outward SARIE Transfer ...', TransactionTypeCode: 'TRF' };
const TODAY = '2026-08-10';

describe('matchingMt940Defs', () => {
  it('returns defs whose rules match the row', () => {
    const match = def('d1', 'TransferOut');
    const noMatch = def('d2', 'Other', {
      TagRuleExpressions: [[{ SourceField: 'AdditionalInformation', ExpressionPrompt: null, ExpressionId: null, Regex: regexify('contains', 'PAYROLL'), RegexDetails: [] }]],
    });
    const result = matchingMt940Defs([match, noMatch], row, TODAY);
    expect(result.map((d) => d.Id)).toEqual(['d1']);
  });

  it('skips non-ACTIVE and rule-less defs', () => {
    const inactive = def('d1', 'T', { StatusTag: 'INACTIVE' });
    const ruleless = def('d2', 'T', { TagRuleExpressions: [] });
    expect(matchingMt940Defs([inactive, ruleless], row, TODAY)).toEqual([]);
  });

  it('IGNORES the def TransactionTypeCode context (MT940/MT942 use different codes)', () => {
    // Row is coded 'TRF'; both defs' rules match the narrative. The TTC scope
    // must NOT gate the match — otherwise a differently-coded intraday row
    // (e.g. 'MSC') would never surface its relevant MT940 rules.
    const otherType = def('d1', 'T', { Context: [{ Key: 'TransactionTypeCode', Value: 'CHG' }] });
    const sameType = def('d2', 'T', { Context: [{ Key: 'TransactionTypeCode', Value: 'TRF' }] });
    expect(matchingMt940Defs([otherType, sameType], row, TODAY).map((d) => d.Id)).toEqual(['d1', 'd2']);
  });

  it('honors the validity window', () => {
    const future = def('d1', 'T', { Validity: { StartDate: '2026-09-01', EndDate: null } });
    const expired = def('d2', 'T', { Validity: { StartDate: null, EndDate: '2026-07-01' } });
    const current = def('d3', 'T', { Validity: { StartDate: '2026-01-01', EndDate: '2026-12-31' } });
    expect(matchingMt940Defs([future, expired, current], row, TODAY).map((d) => d.Id)).toEqual(['d3']);
  });
});
