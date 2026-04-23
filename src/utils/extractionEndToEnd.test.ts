/**
 * End-to-end tests for each extraction method with all its optional parameters.
 * Builds a realistic TagAttribute using regexifyExtraction(), runs
 * extractAttributes() against a synthetic row, and asserts the captured value.
 */
import { describe, it, expect } from 'vitest';
import { regexifyExtraction } from './regexify';
import { extractAttributes } from './extractAttributes';
import type { TagAttribute, TransactionRow } from '../types';

function attr(params: {
  sourceField: string;
  operation: Parameters<typeof regexifyExtraction>[0];
  extraction?: Parameters<typeof regexifyExtraction>[1];
}): TagAttribute {
  return {
    AttributeTag: 'Test',
    IsMandatory: false,
    LOVTag: null,
    ValidationRuleTag: '',
    AttributeRuleExpression: {
      SourceField: params.sourceField,
      ExpressionPrompt: null,
      ExpressionId: null,
      Regex: regexifyExtraction(params.operation, params.extraction ?? {}),
      RegexDetails: [],
    },
  };
}

function extract(row: TransactionRow, a: TagAttribute): string | null {
  return extractAttributes([a], row)['Test'];
}

describe('extraction end-to-end: extract_between', () => {
  const row: TransactionRow = { AdditionalInformation: '/ORDP/John Smith /BENM/Acme Corp /NAR3/Invoice 42' };

  it('captures the value between prefix and suffix', () => {
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_between', extraction: { prefix: '/ORDP/', suffix: ' /' } });
    expect(extract(row, a)).toBe('John Smith');
  });

  it('honors prefixOccurrence', () => {
    const row2: TransactionRow = { AdditionalInformation: 'X/A/first/A/second/A/third/STOP' };
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_between', extraction: { prefix: '/A/', suffix: '/', prefixOccurrence: 2 } });
    expect(extract(row2, a)).toBe('second');
  });

  it('honors suffixOccurrence', () => {
    const row2: TransactionRow = { AdditionalInformation: 'START/X-end-end-end' };
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_between', extraction: { prefix: 'START/', suffix: '-end', suffixOccurrence: 3 } });
    // Lazy capture + third "-end": captures everything up to just before the
    // 3rd "-end" → "X-end-end"
    expect(extract(row2, a)).toBe('X-end-end');
  });
});

describe('extraction end-to-end: extract_after', () => {
  const row: TransactionRow = { AdditionalInformation: 'HEADER/PAYMENT: 12345 EUR trailing data' };

  it('captures everything after the prefix by default', () => {
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_after', extraction: { prefix: 'PAYMENT: ' } });
    expect(extract(row, a)).toBe('12345 EUR trailing data');
  });

  it('honors numChars — fixed-length capture', () => {
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_after', extraction: { prefix: 'PAYMENT: ', numChars: 5 } });
    expect(extract(row, a)).toBe('12345');
  });

  it('honors toStr — captures up to delimiter', () => {
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_after', extraction: { prefix: 'PAYMENT: ', toStr: ' EUR' } });
    expect(extract(row, a)).toBe('12345');
  });

  it('honors occurrence — picks the Nth occurrence of the prefix', () => {
    const row2: TransactionRow = { AdditionalInformation: 'TAG:one TAG:two TAG:three' };
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_after', extraction: { prefix: 'TAG:', toStr: ' ', occurrence: 2 } });
    expect(extract(row2, a)).toBe('two');
  });

  it('combines numChars + toStr (whichever comes first)', () => {
    // 10-char window but stops at first space
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_after', extraction: { prefix: 'PAYMENT: ', numChars: 10, toStr: ' ' } });
    expect(extract(row, a)).toBe('12345');
  });
});

describe('extraction end-to-end: extract_before', () => {
  const row: TransactionRow = { AdditionalInformation: 'BEFORE value after END' };

  it('captures everything before the suffix by default', () => {
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_before', extraction: { suffix: ' END' } });
    expect(extract(row, a)).toBe('BEFORE value after');
  });

  it('honors numChars — fixed-length window just before the suffix', () => {
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_before', extraction: { suffix: ' END', numChars: 5 } });
    expect(extract(row, a)).toBe('after');
  });

  it('honors toStr — capture spans from toStr to suffix', () => {
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_before', extraction: { suffix: ' END', toStr: 'value ' } });
    expect(extract(row, a)).toBe('after');
  });

  it('honors occurrence — uses the Nth suffix', () => {
    const row2: TransactionRow = { AdditionalInformation: 'one | two | three | FIN' };
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_before', extraction: { suffix: ' | ', numChars: 3, occurrence: 2 } });
    expect(extract(row2, a)).toBe('two');
  });
});

describe('extraction end-to-end: extract_matching', () => {
  it('captures a simple pattern', () => {
    const row: TransactionRow = { Description: 'Invoice #A1234 settled' };
    const a = attr({ sourceField: 'Description', operation: 'extract_matching', extraction: { pattern: '[A-Z]\\d+' } });
    expect(extract(row, a)).toBe('A1234');
  });

  it('honors user-supplied capture group (bug fix — not double-wrapped)', () => {
    const row: TransactionRow = { AdditionalInformation: 'IBAN/SA2830400108' };
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_matching', extraction: { pattern: 'IBAN/SA\\d{2}(.{2})' } });
    expect(extract(row, a)).toBe('30');
  });

  it('honors startingPosition', () => {
    const row: TransactionRow = { Description: 'skip me 12345 more' };
    const a = attr({ sourceField: 'Description', operation: 'extract_matching', extraction: { pattern: '\\d+', startingPosition: 8 } });
    expect(extract(row, a)).toBe('12345');
  });

  it('honors occurrence', () => {
    const row: TransactionRow = { Description: 'a1 b22 c333' };
    const a = attr({ sourceField: 'Description', operation: 'extract_matching', extraction: { pattern: '\\d+', occurrence: 3 } });
    expect(extract(row, a)).toBe('333');
  });
});

describe('extraction end-to-end: extract_substring', () => {
  const row: TransactionRow = { BankReference: 'NOLE00049240129' };

  it('captures a fixed window from position', () => {
    const a = attr({ sourceField: 'BankReference', operation: 'extract_substring', extraction: { fromPosition: 4, numChars: 5 } });
    // Skip 4 ("NOLE"), then 5 chars → "00049"
    expect(extract(row, a)).toBe('00049');
  });

  it('captures from start to position when toStart is true', () => {
    const a = attr({ sourceField: 'BankReference', operation: 'extract_substring', extraction: { fromPosition: 4, toStart: true } });
    // First 4 chars
    expect(extract(row, a)).toBe('NOLE');
  });

  it('captures from position to toStr', () => {
    const row2: TransactionRow = { BankReference: 'PREFIX-VALUE-SUFFIX' };
    const a = attr({ sourceField: 'BankReference', operation: 'extract_substring', extraction: { fromPosition: 7, toStr: '-SUFFIX' } });
    expect(extract(row2, a)).toBe('VALUE');
  });

  it('captures from start of string when no fromPosition', () => {
    const a = attr({ sourceField: 'BankReference', operation: 'extract_substring', extraction: { numChars: 4 } });
    expect(extract(row, a)).toBe('NOLE');
  });
});

describe('extraction end-to-end: extract_between_and_verify', () => {
  const row: TransactionRow = { AdditionalInformation: '/CUR/USD/AMT/100' };

  it('captures between prefix and suffix (verify happens elsewhere)', () => {
    const a = attr({ sourceField: 'AdditionalInformation', operation: 'extract_between_and_verify', extraction: { prefix: '/CUR/', suffix: '/', verifyValue: 'USD' } });
    expect(extract(row, a)).toBe('USD');
  });
});

describe('extraction end-to-end: transformations pipeline after extraction', () => {
  it('applies transformations in order after regex extraction', () => {
    const row: TransactionRow = { Description: '  hello WORLD  ' };
    const a: TagAttribute = {
      AttributeTag: 'Test',
      IsMandatory: false,
      LOVTag: null,
      ValidationRuleTag: '',
      AttributeRuleExpression: {
        SourceField: 'Description',
        ExpressionPrompt: null,
        ExpressionId: null,
        Regex: regexifyExtraction('extract_matching', { pattern: '.+' }),
        RegexDetails: [],
      },
      Transformations: [
        { Method: 'trim', Args: [] },
        { Method: 'to_lowercase', Args: [] },
      ],
    };
    expect(extract(row, a)).toBe('hello world');
  });
});
