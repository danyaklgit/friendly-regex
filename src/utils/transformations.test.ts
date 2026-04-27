import { describe, it, expect } from 'vitest';
import { applyTransformation, applyTransformationPipeline } from './transformations';

describe('applyTransformation', () => {
  // --- Text Case ---
  it('to_uppercase converts all characters to uppercase', () => {
    expect(applyTransformation('to_uppercase', {}, 'hello World')).toBe('HELLO WORLD');
  });

  it('to_lowercase converts all characters to lowercase', () => {
    expect(applyTransformation('to_lowercase', {}, 'Hello WORLD')).toBe('hello world');
  });

  it('to_sentence_case capitalizes first letter and after punctuation', () => {
    expect(applyTransformation('to_sentence_case', {}, 'hELLO WORLD. goodbye')).toBe('Hello world. Goodbye');
  });

  it('to_sentence_case handles multiple sentences', () => {
    expect(applyTransformation('to_sentence_case', {}, 'first. second! third? fourth')).toBe('First. Second! Third? Fourth');
  });

  it('to_title_case capitalizes first letter of each word', () => {
    expect(applyTransformation('to_title_case', {}, 'hello world')).toBe('Hello World');
  });

  // --- Trimming ---
  it('trim removes leading and trailing whitespace', () => {
    expect(applyTransformation('trim', {}, '  hello  ')).toBe('hello');
  });

  it('trim_left removes leading whitespace only', () => {
    expect(applyTransformation('trim_left', {}, '  hello  ')).toBe('hello  ');
  });

  it('trim_right removes trailing whitespace only', () => {
    expect(applyTransformation('trim_right', {}, '  hello  ')).toBe('  hello');
  });

  it('collapse_whitespace collapses runs of whitespace and trims', () => {
    expect(applyTransformation('collapse_whitespace', {}, '  hello   world  ')).toBe('hello world');
  });

  // --- Removal ---
  it('remove_alpha strips alphabetic characters', () => {
    expect(applyTransformation('remove_alpha', {}, 'ABC123def')).toBe('123');
  });

  it('remove_numeric strips digit characters', () => {
    expect(applyTransformation('remove_numeric', {}, 'ABC123def')).toBe('ABCdef');
  });

  it('remove_non_numeric strips everything except digits', () => {
    expect(applyTransformation('remove_non_numeric', {}, 'USD 1,234.56')).toBe('123456');
  });

  it('remove_special_chars strips non-alphanumeric except spaces', () => {
    expect(applyTransformation('remove_special_chars', {}, 'hello@world! #123')).toBe('helloworld 123');
  });

  // --- Find/Replace ---
  it('replace replaces all occurrences of a literal string', () => {
    expect(applyTransformation('replace', { find: 'cat', replaceWith: 'dog' }, 'cat and cat')).toBe('dog and dog');
  });

  it('replace returns original when find is empty', () => {
    expect(applyTransformation('replace', { find: '', replaceWith: 'dog' }, 'cat')).toBe('cat');
  });

  it('replace defaults replaceWith to empty string', () => {
    expect(applyTransformation('replace', { find: 'x' }, 'axb')).toBe('ab');
  });

  it('regex_replace replaces all regex matches', () => {
    expect(applyTransformation('regex_replace', { pattern: '\\d+', replaceWith: '#' }, 'abc 123 def 456')).toBe('abc # def #');
  });

  it('regex_replace returns original for empty pattern', () => {
    expect(applyTransformation('regex_replace', { pattern: '', replaceWith: '#' }, 'abc')).toBe('abc');
  });

  it('regex_replace returns original for invalid regex', () => {
    expect(applyTransformation('regex_replace', { pattern: '[invalid', replaceWith: '' }, 'abc')).toBe('abc');
  });

  // --- Formatting ---
  it('pad_left pads to target length', () => {
    expect(applyTransformation('pad_left', { length: '5', char: '0' }, '42')).toBe('00042');
  });

  it('pad_left returns original when length is 0', () => {
    expect(applyTransformation('pad_left', { length: '0', char: '0' }, '42')).toBe('42');
  });

  it('pad_left defaults char to space', () => {
    expect(applyTransformation('pad_left', { length: '5', char: '' }, '42')).toBe('   42');
  });

  it('pad_right pads to target length', () => {
    expect(applyTransformation('pad_right', { length: '5', char: '0' }, '42')).toBe('42000');
  });

  it('pad_right returns original when length is 0', () => {
    expect(applyTransformation('pad_right', { length: '0', char: '0' }, '42')).toBe('42');
  });

  it('date_reformat rearranges date parts', () => {
    expect(applyTransformation('date_reformat', { fromFormat: 'MM/DD/YYYY', toFormat: 'DD-MM-YYYY' }, '12/25/2024')).toBe('25-12-2024');
  });

  it('date_reformat returns original for empty fromFormat', () => {
    expect(applyTransformation('date_reformat', { fromFormat: '', toFormat: 'DD/MM/YYYY' }, '12/25/2024')).toBe('12/25/2024');
  });

  it('date_reformat returns original for empty toFormat', () => {
    expect(applyTransformation('date_reformat', { fromFormat: 'MM/DD/YYYY', toFormat: '' }, '12/25/2024')).toBe('12/25/2024');
  });

  it('date_reformat returns original when part count mismatches', () => {
    expect(applyTransformation('date_reformat', { fromFormat: 'MM/DD/YYYY', toFormat: 'DD-MM-YYYY' }, '12-2024')).toBe('12-2024');
  });

  it('date_reformat handles dot separators', () => {
    expect(applyTransformation('date_reformat', { fromFormat: 'DD.MM.YYYY', toFormat: 'YYYY-MM-DD' }, '25.12.2024')).toBe('2024-12-25');
  });

  // --- Extraction Refinement ---
  it('substring extracts from start index', () => {
    expect(applyTransformation('substring', { start: '6' }, 'Hello World')).toBe('World');
  });

  it('substring extracts with start and end', () => {
    expect(applyTransformation('substring', { start: '0', end: '5' }, 'Hello World')).toBe('Hello');
  });

  it('substring defaults start to 0', () => {
    expect(applyTransformation('substring', { start: '' }, 'Hello')).toBe('Hello');
  });

  it('split_and_pick splits and returns segment at index', () => {
    expect(applyTransformation('split_and_pick', { delimiter: '/', index: '1' }, 'A/B/C')).toBe('B');
  });

  it('split_and_pick returns empty for out-of-bounds index', () => {
    expect(applyTransformation('split_and_pick', { delimiter: '/', index: '10' }, 'A/B/C')).toBe('');
  });

  it('split_and_pick returns original when delimiter is empty', () => {
    expect(applyTransformation('split_and_pick', { delimiter: '', index: '0' }, 'ABC')).toBe('ABC');
  });

  it('split_and_pick defaults index to 0', () => {
    expect(applyTransformation('split_and_pick', { delimiter: '/', index: '' }, 'A/B/C')).toBe('A');
  });

  // --- Maximum Characters ---
  it('max_char_limit truncates to length when no special chars and flag off', () => {
    expect(applyTransformation('max_char_limit', { length: '15', breakAtSpecial: 'false' }, 'ABCDEFGHIJKLMNOPQRST')).toBe('ABCDEFGHIJKLMNO');
  });

  it('max_char_limit ignores special chars when flag is off', () => {
    // Space at index 7 — should still take the first 15 chars verbatim.
    expect(applyTransformation('max_char_limit', { length: '15', breakAtSpecial: 'false' }, 'ABCDEFG HIJKLMNOPQRST')).toBe('ABCDEFG HIJKLMN');
  });

  it('max_char_limit cuts at first space when breakAtSpecial is true', () => {
    expect(applyTransformation('max_char_limit', { length: '15', breakAtSpecial: 'true' }, 'ABCDEFG HIJKLMNOPQRST')).toBe('ABCDEFG');
  });

  it('max_char_limit cuts at first non-alphanumeric (slash) when breakAtSpecial is true', () => {
    expect(applyTransformation('max_char_limit', { length: '15', breakAtSpecial: 'true' }, 'ABCD/EFGHIJ')).toBe('ABCD');
  });

  it('max_char_limit takes first N chars when breakAtSpecial is true and no specials in window', () => {
    expect(applyTransformation('max_char_limit', { length: '15', breakAtSpecial: 'true' }, 'ABCDEFGHIJKLMNOPQRST')).toBe('ABCDEFGHIJKLMNO');
  });

  it('max_char_limit returns full value when shorter than length and no specials', () => {
    expect(applyTransformation('max_char_limit', { length: '15', breakAtSpecial: 'true' }, 'ABC')).toBe('ABC');
  });

  it('max_char_limit returns empty string when value starts with a special char and flag is true', () => {
    expect(applyTransformation('max_char_limit', { length: '15', breakAtSpecial: 'true' }, '/ABCDEF')).toBe('');
  });

  it('max_char_limit returns original value when length is 0', () => {
    expect(applyTransformation('max_char_limit', { length: '0', breakAtSpecial: 'true' }, 'ABCDEF')).toBe('ABCDEF');
  });

  it('max_char_limit returns original value when length is missing or non-numeric', () => {
    expect(applyTransformation('max_char_limit', { length: '', breakAtSpecial: 'false' }, 'ABCDEF')).toBe('ABCDEF');
    expect(applyTransformation('max_char_limit', { length: 'abc', breakAtSpecial: 'false' }, 'ABCDEF')).toBe('ABCDEF');
  });

  it('max_char_limit defaults breakAtSpecial to off when not "true"', () => {
    // Anything other than the literal string "true" is treated as off.
    expect(applyTransformation('max_char_limit', { length: '15' }, 'ABC/DEFGHIJKLMNOPQ')).toBe('ABC/DEFGHIJKLMN');
    expect(applyTransformation('max_char_limit', { length: '15', breakAtSpecial: '1' }, 'ABC/DEFGHIJKLMNOPQ')).toBe('ABC/DEFGHIJKLMN');
  });

  // --- Unknown method ---
  it('returns original value for unknown method', () => {
    expect(applyTransformation('nonexistent', {}, 'hello')).toBe('hello');
  });
});

describe('applyTransformationPipeline', () => {
  it('applies transformations in order', () => {
    const transformations: { id: string; method: string; args: Record<string, string> }[] = [
      { id: '1', method: 'trim', args: {} },
      { id: '2', method: 'to_uppercase', args: {} },
      { id: '3', method: 'replace', args: { find: ' ', replaceWith: '_' } },
    ];
    const steps = applyTransformationPipeline(transformations, '  hello world  ');
    expect(steps).toHaveLength(3);
    expect(steps[0].result).toBe('hello world');
    expect(steps[1].result).toBe('HELLO WORLD');
    expect(steps[2].result).toBe('HELLO_WORLD');
  });

  it('returns empty array for empty transformations', () => {
    expect(applyTransformationPipeline([], 'hello')).toEqual([]);
  });

  it('includes correct step metadata', () => {
    const transformations = [{ id: '1', method: 'to_uppercase', args: {} }];
    const steps = applyTransformationPipeline(transformations, 'hello');
    expect(steps[0]).toEqual({ index: 0, method: 'to_uppercase', label: 'to_uppercase', result: 'HELLO' });
  });

  it('composes max_char_limit with other transformations', () => {
    const transformations = [
      { id: '1', method: 'to_uppercase', args: {} },
      { id: '2', method: 'max_char_limit', args: { length: '5', breakAtSpecial: 'true' } },
    ];
    const steps = applyTransformationPipeline(transformations, 'hello world');
    expect(steps[0].result).toBe('HELLO WORLD');
    expect(steps[1].result).toBe('HELLO');
  });
});
