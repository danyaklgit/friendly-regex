import { describe, it, expect } from 'vitest';
import type { TagSpecDefinition, TransactionRow } from '../types';
import { regexify } from './regexify';
import { matchingMt940Defs, mt940CloneRuleFingerprint } from './mt940Suggestions';

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
});

describe('mt940CloneRuleFingerprint', () => {
  const cond = (sourceField: string, regex: string) => ({
    SourceField: sourceField,
    ExpressionPrompt: null,
    ExpressionId: null,
    Regex: regex,
    RegexDetails: [],
  });

  it('is equal for identical rules regardless of Id/Tag/metadata', () => {
    const a = def('d1', 'TransferIn');
    const b = def('d2', 'TransferInDom', { CertaintyLevelTag: 'LOW' });
    expect(mt940CloneRuleFingerprint(a)).toBe(mt940CloneRuleFingerprint(b));
  });

  it('differs when the rules differ — same tag, different rules stay distinct', () => {
    const a = def('d1', 'TransferInIntl');
    const b = def('d2', 'TransferInIntl', {
      TagRuleExpressions: [[cond('AdditionalInformation', regexify('contains', 'FRACCT'))]],
    });
    expect(mt940CloneRuleFingerprint(a)).not.toBe(mt940CloneRuleFingerprint(b));
  });

  it('ignores transaction-type conditions (clone adapts the TTC)', () => {
    const mt940 = def('d1', 'T', {
      TagRuleExpressions: [[
        cond('AdditionalInformation', regexify('contains', 'SARIE')),
        cond('TransactionTypeCode', regexify('equals', 'NTRF')),
      ]],
    });
    const clone = def('d2', 'T', {
      TagRuleExpressions: [[
        cond('AdditionalInformation', regexify('contains', 'SARIE')),
        cond('TransactionTypeCode', regexify('equals', 'MSC')),
      ]],
    });
    expect(mt940CloneRuleFingerprint(mt940)).toBe(mt940CloneRuleFingerprint(clone));
  });

  it('is order-independent across conditions and groups', () => {
    const c1 = cond('AdditionalInformation', regexify('contains', 'SARIE'));
    const c2 = cond('Description1', regexify('begins_with', 'FRACCT'));
    const g2 = [cond('TransactionDetails', regexify('contains', 'NTRF'))];
    const a = def('d1', 'T', { TagRuleExpressions: [[c1, c2], g2] });
    const b = def('d2', 'T', { TagRuleExpressions: [g2, [c2, c1]] });
    expect(mt940CloneRuleFingerprint(a)).toBe(mt940CloneRuleFingerprint(b));
  });
});
