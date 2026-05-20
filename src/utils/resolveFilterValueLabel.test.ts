import { describe, it, expect } from 'vitest';
import type { FilterDefinition } from '../api/transactions';
import { resolveFilterValueLabel } from './resolveFilterValueLabel';

const defs: FilterDefinition[] = [
  {
    Tag: 'BANKS',
    Label: 'Banks',
    Type: 'LIST',
    Operand: 'IN',
    Values: [
      { Column: 'BankSwiftCode', Value: 'RJHISARI', Label: 'RJHISARI', SubLabel: 'Al Rajhi Bank', Operand: null, DisabledBy: null },
      { Column: 'BankSwiftCode', Value: 'NOSUB', Label: 'No Sub Bank', Operand: null, DisabledBy: null },
    ],
  },
];

describe('resolveFilterValueLabel', () => {
  it('returns "Label — SubLabel" when SubLabel is present', () => {
    expect(resolveFilterValueLabel('BANKS', 'RJHISARI', defs)).toBe('RJHISARI — Al Rajhi Bank');
  });

  it('returns Label alone when SubLabel is absent', () => {
    expect(resolveFilterValueLabel('BANKS', 'NOSUB', defs)).toBe('No Sub Bank');
  });

  it('falls back to the raw value when no match found', () => {
    expect(resolveFilterValueLabel('BANKS', 'UNKNOWN', defs)).toBe('UNKNOWN');
  });

  it('returns the raw value when there are no definitions', () => {
    expect(resolveFilterValueLabel('BANKS', 'RJHISARI', [])).toBe('RJHISARI');
  });

  it('returns the raw value for range/internal keys', () => {
    expect(resolveFilterValueLabel('AMOUNT_GTE', '100', defs)).toBe('100');
    expect(resolveFilterValueLabel('__internal', 'x', defs)).toBe('x');
  });

  it('resolves via data: prefixed column keys', () => {
    expect(resolveFilterValueLabel('data:BankSwiftCode', 'RJHISARI', defs)).toBe('RJHISARI — Al Rajhi Bank');
  });
});
