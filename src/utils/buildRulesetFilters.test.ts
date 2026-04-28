import { describe, it, expect } from 'vitest';
import { buildRulesetFilters } from './buildRulesetFilters';
import type { WizardFormState } from '../types';

function makeFormState(overrides: Partial<WizardFormState> = {}): WizardFormState {
  return {
    tag: '',
    side: 'CR',
    bankSwiftCode: 'ARNBSARI',
    transactionTypeCode: '',
    statusTag: 'ACTIVE',
    certaintyLevelTag: 'HIGH',
    validity: { Start: '2026-01-01', End: null },
    ruleGroups: [],
    attributes: [],
    ...overrides,
  };
}

describe('buildRulesetFilters', () => {
  it('always emits BankSwiftCode and Side as IN filters', () => {
    const filters = buildRulesetFilters(makeFormState());
    expect(filters).toEqual([
      { ColumnName: 'BankSwiftCode', Value: 'ARNBSARI', Operand: 'IN' },
      { ColumnName: 'Side', Value: 'CR', Operand: 'IN' },
    ]);
  });

  it('adds TransactionTypeCode as EQ when set', () => {
    const filters = buildRulesetFilters(makeFormState({ transactionTypeCode: 'TRF' }));
    expect(filters).toContainEqual({ ColumnName: 'TransactionTypeCode', Value: 'TRF', Operand: 'EQ' });
  });

  it('omits TransactionTypeCode when empty', () => {
    const filters = buildRulesetFilters(makeFormState({ transactionTypeCode: '' }));
    expect(filters.find((f) => 'ColumnName' in f && f.ColumnName === 'TransactionTypeCode')).toBeUndefined();
  });

  it('emits a REGEX filter for non-empty rule groups', () => {
    const filters = buildRulesetFilters(makeFormState({
      ruleGroups: [{
        id: 'g1',
        conditions: [
          { id: 'c1', sourceField: 'Description1', operation: 'contains', value: 'SALARY' },
        ],
      }],
    }));
    const regexFilter = filters.find((f) => f.Operand === 'REGEX');
    expect(regexFilter).toBeDefined();
    expect(regexFilter).toMatchObject({
      Operand: 'REGEX',
      Regex: [[{ ColumnName: 'Description1', Options: '' }]],
    });
  });

  it('drops conditions with empty values', () => {
    const filters = buildRulesetFilters(makeFormState({
      ruleGroups: [{
        id: 'g1',
        conditions: [
          { id: 'c1', sourceField: 'Description1', operation: 'contains', value: '' },
          { id: 'c2', sourceField: 'Description2', operation: 'contains', value: 'NET' },
        ],
      }],
    }));
    const regexFilter = filters.find((f): f is Extract<typeof f, { Operand: 'REGEX' }> => f.Operand === 'REGEX');
    expect(regexFilter?.Regex[0]).toHaveLength(1);
    expect(regexFilter?.Regex[0][0].ColumnName).toBe('Description2');
  });

  it('drops numeric operators (greater_than, less_than, ...) from REGEX payload', () => {
    const filters = buildRulesetFilters(makeFormState({
      ruleGroups: [{
        id: 'g1',
        conditions: [
          { id: 'c1', sourceField: 'CreditAmount', operation: 'greater_than', value: '100' },
          { id: 'c2', sourceField: 'CreditAmount', operation: 'less_than_or_equal', value: '500' },
          { id: 'c3', sourceField: 'Description1', operation: 'contains', value: 'TRF' },
        ],
      }],
    }));
    const regexFilter = filters.find((f): f is Extract<typeof f, { Operand: 'REGEX' }> => f.Operand === 'REGEX');
    expect(regexFilter?.Regex[0]).toHaveLength(1);
    expect(regexFilter?.Regex[0][0].ColumnName).toBe('Description1');
  });

  it('drops empty groups entirely from the REGEX payload', () => {
    const filters = buildRulesetFilters(makeFormState({
      ruleGroups: [
        {
          id: 'g1',
          conditions: [{ id: 'c1', sourceField: 'Description1', operation: 'contains', value: '' }],
        },
        {
          id: 'g2',
          conditions: [{ id: 'c2', sourceField: 'Description2', operation: 'contains', value: 'NET' }],
        },
      ],
    }));
    const regexFilter = filters.find((f): f is Extract<typeof f, { Operand: 'REGEX' }> => f.Operand === 'REGEX');
    expect(regexFilter?.Regex).toHaveLength(1);
    expect(regexFilter?.Regex[0][0].ColumnName).toBe('Description2');
  });

  it('omits REGEX filter entirely when all groups are empty', () => {
    const filters = buildRulesetFilters(makeFormState({
      ruleGroups: [{
        id: 'g1',
        conditions: [{ id: 'c1', sourceField: 'Description1', operation: 'contains', value: '' }],
      }],
    }));
    expect(filters.find((f) => f.Operand === 'REGEX')).toBeUndefined();
  });
});
