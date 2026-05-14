import { describe, it, expect } from 'vitest';
import type { AttributeFormValue } from '../types';
import {
  attributeNameKey,
  computeDuplicateAttributeIndexes,
  hasDuplicateAttributeNames,
  isFilledAttribute,
} from './attributeFingerprint';

function attr(name: string, id = name): AttributeFormValue {
  return {
    id,
    attributeTag: name,
    isMandatory: false,
    validationRuleTag: '',
    sourceField: '',
    extractionOperation: '' as AttributeFormValue['extractionOperation'],
  };
}

describe('isFilledAttribute', () => {
  it('treats empty and whitespace-only names as unfilled', () => {
    expect(isFilledAttribute(attr(''))).toBe(false);
    expect(isFilledAttribute(attr('   '))).toBe(false);
  });

  it('treats any non-whitespace name as filled', () => {
    expect(isFilledAttribute(attr('BeneficiaryName'))).toBe(true);
    expect(isFilledAttribute(attr('  X  '))).toBe(true);
  });
});

describe('attributeNameKey', () => {
  it('trims and lowercases', () => {
    expect(attributeNameKey(attr('  BeneficiaryName  '))).toBe('beneficiaryname');
    expect(attributeNameKey(attr('BANK_NAME'))).toBe('bank_name');
  });
});

describe('computeDuplicateAttributeIndexes', () => {
  it('returns all-null for an empty list', () => {
    expect(computeDuplicateAttributeIndexes([])).toEqual([]);
  });

  it('returns all-null when every name is unique', () => {
    const list = [attr('BeneficiaryName'), attr('BankName'), attr('IBAN')];
    expect(computeDuplicateAttributeIndexes(list)).toEqual([null, null, null]);
  });

  it('flags only the later occurrence when names collide', () => {
    const list = [attr('BeneficiaryName', 'a'), attr('BeneficiaryName', 'b')];
    expect(computeDuplicateAttributeIndexes(list)).toEqual([null, 0]);
  });

  it('collides on case- and whitespace-insensitive matching', () => {
    const list = [
      attr('BeneficiaryName', 'a'),
      attr('  beneficiaryname  ', 'b'),
    ];
    expect(computeDuplicateAttributeIndexes(list)).toEqual([null, 0]);
  });

  it('points every later duplicate at the FIRST occurrence, not the previous duplicate', () => {
    const list = [
      attr('X', 'a'),
      attr('X', 'b'),
      attr('X', 'c'),
    ];
    expect(computeDuplicateAttributeIndexes(list)).toEqual([null, 0, 0]);
  });

  it('does not flag empty placeholder rows even when several are present', () => {
    const list = [
      attr('', 'a'),
      attr('', 'b'),
      attr('BeneficiaryName', 'c'),
    ];
    expect(computeDuplicateAttributeIndexes(list)).toEqual([null, null, null]);
  });

  it('mixes filled and empty rows correctly', () => {
    const list = [
      attr('BeneficiaryName', 'a'),
      attr('', 'b'),
      attr('BeneficiaryName', 'c'),
    ];
    expect(computeDuplicateAttributeIndexes(list)).toEqual([null, null, 0]);
  });
});

describe('hasDuplicateAttributeNames', () => {
  it('is false when nothing is filled', () => {
    expect(hasDuplicateAttributeNames([])).toBe(false);
    expect(hasDuplicateAttributeNames([attr(''), attr('')])).toBe(false);
  });

  it('is false when all filled names are unique', () => {
    expect(hasDuplicateAttributeNames([attr('A'), attr('B')])).toBe(false);
  });

  it('is true when any later attribute repeats an earlier name', () => {
    expect(hasDuplicateAttributeNames([attr('A'), attr('B'), attr('A', 'c')])).toBe(true);
  });
});
