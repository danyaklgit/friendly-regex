import { describe, it, expect } from 'vitest';
import { evaluateRuleSet } from './evaluateRuleSet';
import type { AndGroup, TransactionRow } from '../types';

const makeCondition = (field: string, regex: string) => ({
  SourceField: field,
  ExpressionPrompt: null,
  ExpressionId: null,
  Regex: regex,
  RegexDetails: [],
});

const row: TransactionRow = {
  Description1: 'PAYMENT FROM ACME CORP',
  Amount: '1500.50',
  Side: 'CR',
  TransactionTypeCode: '103',
  BankSwiftCode: 'NCBKSAJE',
};

describe('evaluateRuleSet', () => {
  it('matches all conditions (AND logic)', () => {
    const group: AndGroup = [
      makeCondition('Side', '^CR$'),
      makeCondition('TransactionTypeCode', '^103$'),
    ];
    expect(evaluateRuleSet(group, row)).toBe(true);
  });

  it('fails when one condition does not match', () => {
    const group: AndGroup = [
      makeCondition('Side', '^CR$'),
      makeCondition('TransactionTypeCode', '^202$'),
    ];
    expect(evaluateRuleSet(group, row)).toBe(false);
  });

  it('returns false for null/undefined field', () => {
    const group: AndGroup = [makeCondition('NonexistentField', '.*')];
    expect(evaluateRuleSet(group, row)).toBe(false);
  });

  it('handles contains regex', () => {
    const group: AndGroup = [makeCondition('Description1', 'ACME')];
    expect(evaluateRuleSet(group, row)).toBe(true);
  });

  it('handles negative lookahead', () => {
    const group: AndGroup = [makeCondition('Description1', '^(?!.*VOID)')];
    expect(evaluateRuleSet(group, row)).toBe(true);
  });

  it('handles numeric greater_than', () => {
    const group: AndGroup = [makeCondition('Amount', '__NUMERIC_GT:1000')];
    expect(evaluateRuleSet(group, row)).toBe(true);
  });

  it('handles numeric less_than', () => {
    const group: AndGroup = [makeCondition('Amount', '__NUMERIC_LT:1000')];
    expect(evaluateRuleSet(group, row)).toBe(false);
  });

  it('handles numeric greater_than_or_equal', () => {
    const group: AndGroup = [makeCondition('Amount', '__NUMERIC_GTE:1500.50')];
    expect(evaluateRuleSet(group, row)).toBe(true);
  });

  it('handles numeric less_than_or_equal', () => {
    const group: AndGroup = [makeCondition('Amount', '__NUMERIC_LTE:1500.50')];
    expect(evaluateRuleSet(group, row)).toBe(true);
  });

  it('returns false for non-numeric field with numeric op', () => {
    const group: AndGroup = [makeCondition('Description1', '__NUMERIC_GT:100')];
    expect(evaluateRuleSet(group, row)).toBe(false);
  });

  it('returns false for invalid regex', () => {
    const group: AndGroup = [makeCondition('Description1', '[invalid')];
    expect(evaluateRuleSet(group, row)).toBe(false);
  });

  it('empty group matches everything (vacuous truth)', () => {
    expect(evaluateRuleSet([], row)).toBe(true);
  });

  it('trims field value before testing', () => {
    const rowWithSpaces: TransactionRow = { Code: '  CR  ' };
    const group: AndGroup = [makeCondition('Code', '^CR$')];
    expect(evaluateRuleSet(group, rowWithSpaces)).toBe(true);
  });

  it('matches a literal date input against an ISO date-time stored value', () => {
    // Rule "StatementDate equals 2022-07-18" compiles to ^2022-07-18$ but the
    // stored value is the full ISO timestamp. The evaluator should still match.
    const rowWithDate: TransactionRow = { StatementDate: '2022-07-18T00:00:00Z' };
    const group: AndGroup = [makeCondition('StatementDate', '^2022-07-18$')];
    expect(evaluateRuleSet(group, rowWithDate)).toBe(true);
  });

  it('still rejects a wrong literal date against an ISO date-time stored value', () => {
    const rowWithDate: TransactionRow = { StatementDate: '2022-07-18T00:00:00Z' };
    const group: AndGroup = [makeCondition('StatementDate', '^2022-07-19$')];
    expect(evaluateRuleSet(group, rowWithDate)).toBe(false);
  });

  it('does_not_end_with on an ISO timestamp rejects rows whose date ends with the literal', () => {
    // Regex for does_not_end_with '26' against an ISO timestamp field. Without
    // canonicalising to the date portion, the time suffix ("00:00:00Z") would
    // satisfy the negative lookahead and the row would incorrectly pass.
    const rowWithDate: TransactionRow = { StatementDate: '2024-03-26T00:00:00Z' };
    const group: AndGroup = [makeCondition('StatementDate', '^(?!.*26$).*$')];
    expect(evaluateRuleSet(group, rowWithDate)).toBe(false);
  });

  it('does_not_end_with on an ISO timestamp passes rows whose date does not end with the literal', () => {
    const rowWithDate: TransactionRow = { StatementDate: '2024-04-25T00:00:00Z' };
    const group: AndGroup = [makeCondition('StatementDate', '^(?!.*26$).*$')];
    expect(evaluateRuleSet(group, rowWithDate)).toBe(true);
  });

  it('does_not_equal on an ISO timestamp rejects the matching date', () => {
    const rowWithDate: TransactionRow = { StatementDate: '2024-03-26T00:00:00Z' };
    const group: AndGroup = [makeCondition('StatementDate', '^(?!2024-03-26$).*$')];
    expect(evaluateRuleSet(group, rowWithDate)).toBe(false);
  });
});
