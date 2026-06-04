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

function regexBlock(filters: ReturnType<typeof buildRulesetFilters>) {
  return filters.find((f): f is Extract<typeof f, { Operand: 'REGEX' }> => f.Operand === 'REGEX');
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
    const r = regexBlock(filters);
    expect(r).toBeDefined();
    expect(r).toMatchObject({
      Operand: 'REGEX',
      Regex: [[{ ColumnName: 'Description1', Options: '' }]],
    });
  });

  it('keeps nullary conditions (is_blank_or_empty) in the REGEX payload despite empty Value', () => {
    // The old gate filtered out any condition with `value.trim().length === 0`,
    // which silently dropped nullary ops from the GETMT940 payload and left
    // the table unfiltered. The REGEX inner-condition Value must carry the
    // anchored whitespace-only pattern so the backend filters server-side.
    const filters = buildRulesetFilters(makeFormState({
      ruleGroups: [{
        id: 'g1',
        conditions: [
          { id: 'c1', sourceField: 'AdditionalInformation', operation: 'is_blank_or_empty', value: '' },
        ],
      }],
    }));
    const r = regexBlock(filters);
    expect(r?.Regex[0]).toHaveLength(1);
    expect(r?.Regex[0][0]).toEqual({
      ColumnName: 'AdditionalInformation',
      Value: '^\\s*$',
      Options: '',
    });
  });

  it('keeps nullary conditions (is_not_blank_or_empty) in the REGEX payload despite empty Value', () => {
    const filters = buildRulesetFilters(makeFormState({
      ruleGroups: [{
        id: 'g1',
        conditions: [
          { id: 'c1', sourceField: 'AdditionalInformation', operation: 'is_not_blank_or_empty', value: '' },
        ],
      }],
    }));
    const r = regexBlock(filters);
    expect(r?.Regex[0]).toHaveLength(1);
    expect(r?.Regex[0][0]).toEqual({
      ColumnName: 'AdditionalInformation',
      Value: '^\\s*\\S[\\s\\S]*$',
      Options: '',
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
    const r = regexBlock(filters);
    expect(r?.Regex[0]).toHaveLength(1);
    expect(r?.Regex[0][0].ColumnName).toBe('Description2');
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
    const r = regexBlock(filters);
    expect(r?.Regex).toHaveLength(1);
    expect(r?.Regex[0][0].ColumnName).toBe('Description2');
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

  describe('date GT/LT in REGEX block', () => {
    it('compiles StatementDate > 2024-01-29 into a regex inside REGEX[0]', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [{
          id: 'g1',
          conditions: [
            { id: 'c1', sourceField: 'StatementDate', operation: 'greater_than', value: '2024-01-29' },
          ],
        }],
      }));
      // No top-level StatementDate filter — date GT lives inside REGEX now.
      expect(filters.find((f) => 'ColumnName' in f && f.ColumnName === 'StatementDate')).toBeUndefined();

      const r = regexBlock(filters);
      expect(r?.Regex[0]).toHaveLength(1);
      const inner = r!.Regex[0][0];
      expect(inner.ColumnName).toBe('StatementDate');
      expect(inner.Options).toBe('');
      expect(inner.Value.startsWith('^')).toBe(true);
      expect(inner.Value.endsWith('(T|$)')).toBe(true);

      // Compiled regex correctness — round-trip via new RegExp.
      const re = new RegExp(inner.Value);
      expect(re.test('2024-01-30')).toBe(true);
      expect(re.test('2024-01-30T00:00:00Z')).toBe(true);
      expect(re.test('2024-01-29')).toBe(false);
      expect(re.test('2023-12-31')).toBe(false);
    });

    it('compiles EntryDate < 2024-01-01 into a regex matching earlier dates', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [{
          id: 'g1',
          conditions: [
            { id: 'c1', sourceField: 'EntryDate', operation: 'less_than', value: '2024-01-01' },
          ],
        }],
      }));
      const r = regexBlock(filters);
      const inner = r!.Regex[0][0];
      const re = new RegExp(inner.Value);
      expect(re.test('2023-12-31')).toBe(true);
      expect(re.test('2024-01-01')).toBe(false);
    });

    it('keeps date GT alongside text contains in the same AND group', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [{
          id: 'g1',
          conditions: [
            { id: 'c1', sourceField: 'StatementDate', operation: 'greater_than', value: '2024-01-29' },
            { id: 'c2', sourceField: 'AdditionalInformation', operation: 'contains', value: 'TNXT/56' },
          ],
        }],
      }));
      const r = regexBlock(filters);
      expect(r?.Regex).toHaveLength(1);
      expect(r?.Regex[0]).toHaveLength(2);
      expect(r?.Regex[0][0].ColumnName).toBe('StatementDate');
      expect(r?.Regex[0][1].ColumnName).toBe('AdditionalInformation');
      expect(r?.Regex[0][1].Value).toBe('TNXT/56');
    });

    it('puts each group\'s date condition in its own Regex[i] array', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [
          {
            id: 'g1',
            conditions: [
              { id: 'c1', sourceField: 'StatementDate', operation: 'greater_than', value: '2024-01-01' },
            ],
          },
          {
            id: 'g2',
            conditions: [
              { id: 'c2', sourceField: 'StatementDate', operation: 'less_than', value: '2023-12-31' },
            ],
          },
        ],
      }));
      const r = regexBlock(filters);
      expect(r?.Regex).toHaveLength(2);
      expect(r?.Regex[0][0].ColumnName).toBe('StatementDate');
      expect(r?.Regex[1][0].ColumnName).toBe('StatementDate');
      // Different compiled patterns for > vs <
      expect(r?.Regex[0][0].Value).not.toBe(r?.Regex[1][0].Value);
    });
  });

  describe('Amount GT/LT in REGEX block', () => {
    it('compiles Amount > 100 into a regex inside REGEX[0]', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [{
          id: 'g1',
          conditions: [
            { id: 'c1', sourceField: 'Amount', operation: 'greater_than', value: '100' },
          ],
        }],
      }));
      // No top-level Amount filter.
      expect(filters.find((f) => 'ColumnName' in f && f.ColumnName === 'Amount')).toBeUndefined();

      const r = regexBlock(filters);
      const inner = r!.Regex[0][0];
      expect(inner.ColumnName).toBe('Amount');
      const re = new RegExp(inner.Value);
      expect(re.test('101')).toBe(true);
      expect(re.test('100.50')).toBe(true);
      expect(re.test('1500.50')).toBe(true);
      expect(re.test('100')).toBe(false);
      expect(re.test('99')).toBe(false);
    });

    it('compiles Amount < 100 into a regex matching smaller values', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [{
          id: 'g1',
          conditions: [
            { id: 'c1', sourceField: 'Amount', operation: 'less_than', value: '100' },
          ],
        }],
      }));
      const r = regexBlock(filters);
      const inner = r!.Regex[0][0];
      const re = new RegExp(inner.Value);
      expect(re.test('0')).toBe(true);
      expect(re.test('99')).toBe(true);
      expect(re.test('99.99')).toBe(true);
      expect(re.test('-50')).toBe(true);
      expect(re.test('100')).toBe(false);
      expect(re.test('101')).toBe(false);
    });

    it('compiles a decimal Amount threshold (Amount > 100.5)', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [{
          id: 'g1',
          conditions: [
            { id: 'c1', sourceField: 'Amount', operation: 'greater_than', value: '100.5' },
          ],
        }],
      }));
      const r = regexBlock(filters);
      const re = new RegExp(r!.Regex[0][0].Value);
      expect(re.test('100.6')).toBe(true);
      expect(re.test('101')).toBe(true);
      expect(re.test('1000.50')).toBe(true);
      expect(re.test('100.5')).toBe(false);
      expect(re.test('100.50')).toBe(false);
      expect(re.test('100.4')).toBe(false);
      expect(re.test('100')).toBe(false);
    });

    it('compiles negative threshold Amount > -50', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [{
          id: 'g1',
          conditions: [
            { id: 'c1', sourceField: 'Amount', operation: 'greater_than', value: '-50' },
          ],
        }],
      }));
      const r = regexBlock(filters);
      const re = new RegExp(r!.Regex[0][0].Value);
      expect(re.test('-49')).toBe(true);
      expect(re.test('0')).toBe(true);
      expect(re.test('100')).toBe(true);
      expect(re.test('-50')).toBe(false);
      expect(re.test('-51')).toBe(false);
    });

    it('keeps Amount GT alongside text contains in the same group', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [{
          id: 'g1',
          conditions: [
            { id: 'c1', sourceField: 'Amount', operation: 'greater_than', value: '100' },
            { id: 'c2', sourceField: 'Description1', operation: 'contains', value: 'TRF' },
          ],
        }],
      }));
      const r = regexBlock(filters);
      expect(r?.Regex[0]).toHaveLength(2);
      expect(r?.Regex[0][0].ColumnName).toBe('Amount');
      expect(r?.Regex[0][1].ColumnName).toBe('Description1');
    });

    it('drops the condition when threshold is not numeric (defence in depth)', () => {
      const filters = buildRulesetFilters(makeFormState({
        ruleGroups: [{
          id: 'g1',
          conditions: [
            // Numeric op on a non-numeric value — the UI prevents this combo
            // but the build path is defensive.
            { id: 'c1', sourceField: 'Description1', operation: 'greater_than', value: 'ACME' },
          ],
        }],
      }));
      expect(filters.find((f) => f.Operand === 'REGEX')).toBeUndefined();
    });
  });
});
