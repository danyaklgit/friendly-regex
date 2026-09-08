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
});

// The "Match transaction type" toggle (MT942 / Interim MT940 workspaces).
// Opt-in: the def's OWN Context code must equal the row's, and a def with no
// code is hidden rather than treated as unconstrained.
describe('matchingMt940Defs — matchTransactionType', () => {
  const sameType = def('d1', 'Same', { Context: [{ Key: 'TransactionTypeCode', Value: 'TRF' }] });
  const otherType = def('d2', 'Other', { Context: [{ Key: 'TransactionTypeCode', Value: 'CHG' }] });
  const noType = def('d3', 'Untyped');

  it('keeps only defs whose Context code equals the row code', () => {
    const result = matchingMt940Defs([sameType, otherType, noType], row, TODAY, true);
    expect(result.map((d) => d.Id)).toEqual(['d1']);
  });

  it('hides a def that carries no transaction type code', () => {
    expect(matchingMt940Defs([noType], row, TODAY, true)).toEqual([]);
  });

  it('is off by default — same inputs return every rule-matching def', () => {
    const result = matchingMt940Defs([sameType, otherType, noType], row, TODAY);
    expect(result.map((d) => d.Id)).toEqual(['d1', 'd2', 'd3']);
  });

  it('still requires the rules themselves to match', () => {
    const sameTypeWrongNarrative = def('d4', 'Same', {
      Context: [{ Key: 'TransactionTypeCode', Value: 'TRF' }],
      TagRuleExpressions: [[{ SourceField: 'AdditionalInformation', ExpressionPrompt: null, ExpressionId: null, Regex: regexify('contains', 'PAYROLL'), RegexDetails: [] }]],
    });
    expect(matchingMt940Defs([sameTypeWrongNarrative], row, TODAY, true)).toEqual([]);
  });

  it('suggests nothing when the row has no transaction type code', () => {
    const untypedRow: TransactionRow = { AdditionalInformation: 'Outward SARIE Transfer ...' };
    expect(matchingMt940Defs([sameType, otherType, noType], untypedRow, TODAY, true)).toEqual([]);
  });
});

// Regression (2026-09-08): intraday rows were missing recommendations for
// rules that combine a positive narrative condition with a NEGATIVE guard —
// e.g. D2 pattern ^SA\d{2}45\d{18}$ AND AI does-not-contain 'ACC TO ACC'
// (type 101). Two causes: (a) a null/absent field failed EVERY condition,
// including negations that an empty field plainly satisfies; (b) the
// `^(?!…).*$` negation shape could never match a multi-line narrative
// (`.` stopped at the first newline).
describe('matchingMt940Defs — negative conditions on absent / multi-line fields', () => {
  const ibanIntraDef = def('iban', 'IntraBankTransfer', {
    Context: [{ Key: 'TransactionTypeCode', Value: '101' }],
    TagRuleExpressions: [[
      { SourceField: 'Description2', ExpressionPrompt: null, ExpressionId: null, Regex: regexify('match_regex', '^SA\\d{2}45\\d{18}$'), RegexDetails: [] },
      { SourceField: 'AdditionalInformation', ExpressionPrompt: null, ExpressionId: null, Regex: regexify('does_not_contain', 'ACC TO ACC'), RegexDetails: [] },
    ]],
  });
  const D2 = 'SA1245000000000000000001'; // SA + 2 digits + 45 + 18 digits

  it('matches when the negated field is null / missing (nothing cannot contain the phrase)', () => {
    const nullAi: TransactionRow = { Description2: D2, AdditionalInformation: null, TransactionTypeCode: '101' };
    const missingAi: TransactionRow = { Description2: D2, TransactionTypeCode: '101' };
    expect(matchingMt940Defs([ibanIntraDef], nullAi, TODAY).map((d) => d.Id)).toEqual(['iban']);
    expect(matchingMt940Defs([ibanIntraDef], missingAi, TODAY).map((d) => d.Id)).toEqual(['iban']);
  });

  it('matches a multi-line narrative that does not carry the phrase', () => {
    const multiLine: TransactionRow = {
      Description2: D2,
      AdditionalInformation: 'TRANSFER ORDER\nVALUE DATE 2026-08-01',
      TransactionTypeCode: '101',
    };
    expect(matchingMt940Defs([ibanIntraDef], multiLine, TODAY).map((d) => d.Id)).toEqual(['iban']);
  });

  it('still refuses rows that DO carry the phrase — on any line', () => {
    const firstLine: TransactionRow = { Description2: D2, AdditionalInformation: 'ACC TO ACC TRANSFER', TransactionTypeCode: '101' };
    const laterLine: TransactionRow = { Description2: D2, AdditionalInformation: 'TRANSFER ORDER\nACC TO ACC', TransactionTypeCode: '101' };
    expect(matchingMt940Defs([ibanIntraDef], firstLine, TODAY)).toEqual([]);
    expect(matchingMt940Defs([ibanIntraDef], laterLine, TODAY)).toEqual([]);
  });

  it('a null field still fails POSITIVE and numeric conditions', () => {
    const positive = def('p', 'T', {
      TagRuleExpressions: [[{ SourceField: 'AdditionalInformation', ExpressionPrompt: null, ExpressionId: null, Regex: regexify('contains', 'SARIE'), RegexDetails: [] }]],
    });
    const numeric = def('n', 'T', {
      TagRuleExpressions: [[{ SourceField: 'Amount', ExpressionPrompt: null, ExpressionId: null, Regex: regexify('greater_than', '100'), RegexDetails: [] }]],
    });
    const bareRow: TransactionRow = { Description2: D2 };
    expect(matchingMt940Defs([positive, numeric], bareRow, TODAY)).toEqual([]);
  });
});
