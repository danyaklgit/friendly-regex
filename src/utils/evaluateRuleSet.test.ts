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
});
