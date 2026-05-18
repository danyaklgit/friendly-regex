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
    validity: { StartDate: '2026-01-01', EndDate: null },
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

  describe('date Greater than / Less than lifting', () => {
    it('lifts a single-group StatementDate > to a top-level GT filter', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [{
          id: 'g1',
          conditions: [
            { id: 'c1', sourceField: 'StatementDate', operation: 'greater_than', value: '2024-01-29' },
          ],
        }],
      }));
      expect(filters).toContainEqual({
        ColumnName: 'StatementDate',
        Value: '2024-01-29',
        Operand: 'GT',
      });
      expect(filters.find((f) => f.Operand === 'REGEX')).toBeUndefined();
    });

    it('lifts greater_than_or_equal/less_than/less_than_or_equal as GTE/LT/LTE', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [{
          id: 'g1',
          conditions: [
            { id: 'c1', sourceField: 'EntryDate', operation: 'greater_than_or_equal', value: '2024-01-01' },
            { id: 'c2', sourceField: 'ValueDate', operation: 'less_than', value: '2024-12-31' },
            { id: 'c3', sourceField: 'StatementDate', operation: 'less_than_or_equal', value: '2024-06-30' },
          ],
        }],
      }));
      expect(filters).toContainEqual({ ColumnName: 'EntryDate', Value: '2024-01-01', Operand: 'GTE' });
      expect(filters).toContainEqual({ ColumnName: 'ValueDate', Value: '2024-12-31', Operand: 'LT' });
      expect(filters).toContainEqual({ ColumnName: 'StatementDate', Value: '2024-06-30', Operand: 'LTE' });
    });

    it('keeps text conditions in REGEX alongside lifted date conditions', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [{
          id: 'g1',
          conditions: [
            { id: 'c1', sourceField: 'StatementDate', operation: 'greater_than', value: '2024-01-29' },
            { id: 'c2', sourceField: 'AdditionalInformation', operation: 'contains', value: 'NOLO' },
          ],
        }],
      }));
      expect(filters).toContainEqual({ ColumnName: 'StatementDate', Value: '2024-01-29', Operand: 'GT' });
      const regexFilter = filters.find((f): f is Extract<typeof f, { Operand: 'REGEX' }> => f.Operand === 'REGEX');
      expect(regexFilter?.Regex[0]).toHaveLength(1);
      expect(regexFilter?.Regex[0][0].ColumnName).toBe('AdditionalInformation');
    });

    it('does NOT lift date conditions when there are multiple rule groups (OR semantics would break)', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [
          {
            id: 'g1',
            conditions: [
              { id: 'c1', sourceField: 'StatementDate', operation: 'greater_than', value: '2024-01-01' },
              { id: 'c2', sourceField: 'AdditionalInformation', operation: 'contains', value: 'A' },
            ],
          },
          {
            id: 'g2',
            conditions: [
              { id: 'c3', sourceField: 'StatementDate', operation: 'less_than', value: '2023-12-31' },
              { id: 'c4', sourceField: 'AdditionalInformation', operation: 'contains', value: 'B' },
            ],
          },
        ],
      }));
      // No top-level date filter, because lifting would AND-join across OR
      // groups and lose rows that match only one group's date range.
      expect(filters.find((f) => 'Operand' in f && (f.Operand === 'GT' || f.Operand === 'LT'))).toBeUndefined();
    });

    it('does NOT lift numeric Amount conditions (still dropped from REGEX, client-side eval)', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [{
          id: 'g1',
          conditions: [
            { id: 'c1', sourceField: 'Amount', operation: 'greater_than', value: '100' },
            { id: 'c2', sourceField: 'Description1', operation: 'contains', value: 'TRF' },
          ],
        }],
      }));
      // Amount is not a date field; no top-level GT lifting.
      expect(filters.find((f) => 'ColumnName' in f && f.ColumnName === 'Amount')).toBeUndefined();
      const regexFilter = filters.find((f): f is Extract<typeof f, { Operand: 'REGEX' }> => f.Operand === 'REGEX');
      expect(regexFilter?.Regex[0]).toHaveLength(1);
      expect(regexFilter?.Regex[0][0].ColumnName).toBe('Description1');
    });
  });
});
