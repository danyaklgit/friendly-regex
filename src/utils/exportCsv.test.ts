import { describe, it, expect } from 'vitest';
import { toCsv } from './exportCsv';

describe('toCsv', () => {
  it('renders a header row + data rows joined by CRLF', () => {
    expect(toCsv(['A', 'B'], [['1', '2'], ['3', '4']])).toBe('A,B\r\n1,2\r\n3,4');
  });

  it('quotes fields containing commas, quotes, or newlines and escapes quotes', () => {
    expect(toCsv(['x'], [['a,b']])).toBe('x\r\n"a,b"');
    expect(toCsv(['x'], [['he said "hi"']])).toBe('x\r\n"he said ""hi"""');
    expect(toCsv(['x'], [['line1\nline2']])).toBe('x\r\n"line1\nline2"');
  });

  it('renders null/undefined as empty and coerces numbers', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, 5]])).toBe('a,b,c\r\n,,5');
  });

  it('preserves non-ASCII (Arabic) values verbatim', () => {
    expect(toCsv(['name'], [['شركة بواء']])).toBe('name\r\nشركة بواء');
  });

  it('handles an empty row set (header only)', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b');
  });
});
