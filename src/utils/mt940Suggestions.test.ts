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

  it('IGNORES a TransactionTypeCode/Name CONDITION, matching on the remaining conditions', () => {
    // The MT940 rule requires a narrative match AND type 'Expense'. The intraday
    // row is a differently-typed 'TRF' — the type condition must be stripped so
    // the rule still matches on its narrative (the "works on first page only"
    // bug: only rows whose type coincided ever showed the suggestion).
    const narrativeAndType = def('d1', 'SADADBillPay', {
      TagRuleExpressions: [[
        { SourceField: 'AdditionalInformation', ExpressionPrompt: null, ExpressionId: null, Regex: regexify('contains', 'SARIE'), RegexDetails: [] },
        { SourceField: 'TransactionTypeName', ExpressionPrompt: null, ExpressionId: null, Regex: regexify('equals', 'Expense'), RegexDetails: [] },
      ]],
    });
    expect(matchingMt940Defs([narrativeAndType], row, TODAY).map((d) => d.Id)).toEqual(['d1']);
  });

  it('suggests a rule whose ONLY condition is the transaction type (type ignored ⇒ applies to any row)', () => {
    const typeOnly = def('d1', 'ExpenseTag', {
      TagRuleExpressions: [[
        { SourceField: 'TransactionTypeCode', ExpressionPrompt: null, ExpressionId: null, Regex: regexify('equals', 'CHG'), RegexDetails: [] },
      ]],
    });
    // Row is coded 'TRF' (≠ 'CHG'), but with type ignored the rule imposes
    // nothing else, so it is offered as a clone candidate.
    expect(matchingMt940Defs([typeOnly], row, TODAY).map((d) => d.Id)).toEqual(['d1']);
  });

  it('honors the validity window', () => {
    const future = def('d1', 'T', { Validity: { StartDate: '2026-09-01', EndDate: null } });
    const expired = def('d2', 'T', { Validity: { StartDate: null, EndDate: '2026-07-01' } });
    const current = def('d3', 'T', { Validity: { StartDate: '2026-01-01', EndDate: '2026-12-31' } });
    expect(matchingMt940Defs([future, expired, current], row, TODAY).map((d) => d.Id)).toEqual(['d3']);
  });

  it('treats C# DateTime.MinValue validity bounds as "no bound", not as expired', () => {
    // Some backend serializers ship "0001-01-01T00:00:00" instead of null for
    // an unset bound. A literal comparison reads that EndDate as "expired in
    // year 1" and silently excludes every rule (prod-only data shape).
    const minValueEnd = def('d1', 'T', { Validity: { StartDate: null, EndDate: '0001-01-01T00:00:00' } });
    const minValueBoth = def('d2', 'T', { Validity: { StartDate: '0001-01-01T00:00:00', EndDate: '0001-01-01T00:00:00' } });
    expect(matchingMt940Defs([minValueEnd, minValueBoth], row, TODAY).map((d) => d.Id)).toEqual(['d1', 'd2']);
  });
});
