import { describe, it, expect } from 'vitest';
import type { AttributeFormValue } from '../types';
import {
  attributeNameKey,
  computeDuplicateAttributeIndexes,
  hasDuplicateAttributeNames,
  hasIncompleteAttribute,
  isCompleteAttribute,
  isFilledAttribute,
} from './attributeFingerprint';

function attr(name: string, id = name, overrides: Partial<AttributeFormValue> = {}): AttributeFormValue {
  return {
    id,
    attributeTag: name,
    isMandatory: false,
    validationRuleTag: '',
    sourceField: '',
    extractionOperation: '' as AttributeFormValue['extractionOperation'],
    ...overrides,
  };
}

function completeAttr(overrides: Partial<AttributeFormValue> = {}): AttributeFormValue {
  return {
    id: 'x',
    attributeTag: 'BeneficiaryName',
    isMandatory: false,
    validationRuleTag: '',
    sourceField: 'Description1',
    extractionOperation: 'extract_after' as AttributeFormValue['extractionOperation'],
    prefix: 'FAVOR ',
    ...overrides,
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

describe('isCompleteAttribute', () => {
  it('rejects rows missing name, source field, or extraction method', () => {
    expect(isCompleteAttribute(completeAttr({ attributeTag: '' }))).toBe(false);
    expect(isCompleteAttribute(completeAttr({ sourceField: '' }))).toBe(false);
    expect(isCompleteAttribute(completeAttr({
      extractionOperation: '' as AttributeFormValue['extractionOperation'],
    }))).toBe(false);
  });

  it('requires the prefix field for extract_after', () => {
    expect(isCompleteAttribute(completeAttr({ prefix: '' }))).toBe(false);
  });

  it('requires both prefix and suffix for extract_between', () => {
    const baseline = completeAttr({
      extractionOperation: 'extract_between' as AttributeFormValue['extractionOperation'],
      prefix: 'FAVOR ',
      suffix: ' /',
    });
    expect(isCompleteAttribute(baseline)).toBe(true);
    expect(isCompleteAttribute({ ...baseline, suffix: '' })).toBe(false);
    expect(isCompleteAttribute({ ...baseline, prefix: '' })).toBe(false);
  });

  it('passes for extract_full_field with no operation-specific fields', () => {
    expect(isCompleteAttribute(completeAttr({
      extractionOperation: 'extract_full_field' as AttributeFormValue['extractionOperation'],
      prefix: undefined,
    }))).toBe(true);
  });

  it('requires numChars (> 0) for extract_last_n_chars', () => {
    const base = completeAttr({
      extractionOperation: 'extract_last_n_chars' as AttributeFormValue['extractionOperation'],
      prefix: undefined,
    });
    expect(isCompleteAttribute({ ...base, numChars: undefined })).toBe(false);
    expect(isCompleteAttribute({ ...base, numChars: 0 })).toBe(false);
    expect(isCompleteAttribute({ ...base, numChars: 4 })).toBe(true);
  });

  it('requires a take count (> 0) or tillEndOfInput for extract_skip_take', () => {
    const base = completeAttr({
      extractionOperation: 'extract_skip_take' as AttributeFormValue['extractionOperation'],
      prefix: undefined,
      fromPosition: 40,
    });
    expect(isCompleteAttribute({ ...base, numChars: undefined, tillEndOfInput: undefined })).toBe(false);
    expect(isCompleteAttribute({ ...base, numChars: 0 })).toBe(false);
    expect(isCompleteAttribute({ ...base, numChars: 10 })).toBe(true);
    expect(isCompleteAttribute({ ...base, tillEndOfInput: true })).toBe(true);
  });

  it('constant mode: requires a non-empty constantValue, ignores extraction fields', () => {
    // No sourceField / extractionOperation / prefix needed when isConstant is true.
    const base: AttributeFormValue = {
      id: 'x',
      attributeTag: 'Channel',
      isMandatory: false,
      validationRuleTag: '',
      sourceField: '',
      extractionOperation: '' as AttributeFormValue['extractionOperation'],
      isConstant: true,
    };
    expect(isCompleteAttribute(base)).toBe(false);
    expect(isCompleteAttribute({ ...base, constantValue: '' })).toBe(false);
    expect(isCompleteAttribute({ ...base, constantValue: '   ' })).toBe(false);
    expect(isCompleteAttribute({ ...base, constantValue: 'Branch' })).toBe(true);
  });

  it('constant mode still requires a non-empty attribute name', () => {
    expect(isCompleteAttribute({
      id: 'x',
      attributeTag: '',
      isMandatory: false,
      validationRuleTag: '',
      sourceField: '',
      extractionOperation: '' as AttributeFormValue['extractionOperation'],
      isConstant: true,
      constantValue: 'Branch',
    })).toBe(false);
  });

  it('passes the canonical fully-filled extract_after attribute', () => {
    expect(isCompleteAttribute(completeAttr())).toBe(true);
  });
});

describe('hasIncompleteAttribute', () => {
  it('is false for an empty array', () => {
    expect(hasIncompleteAttribute([])).toBe(false);
  });

  it('is true when any attribute is missing a required field', () => {
    expect(hasIncompleteAttribute([completeAttr(), attr('Placeholder')])).toBe(true);
  });

  it('is false when every attribute is complete', () => {
    expect(hasIncompleteAttribute([
      completeAttr(),
      completeAttr({ attributeTag: 'BankName', prefix: 'BANK:' }),
    ])).toBe(false);
  });
});
