import { describe, it, expect } from 'vitest';
import { applyTransformation, applyTransformationPipeline } from './transformations';
import type { TransformationFormValue } from '../types';

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

  it('collapse_spaces collapses interior runs of 2+ spaces to one', () => {
    expect(applyTransformation('collapse_spaces', {}, 'Charges:     5.00 REM ID:1010')).toBe(
      'Charges: 5.00 REM ID:1010',
    );
  });

  it('collapse_spaces leaves single spaces, tabs, and newlines untouched and does not trim', () => {
    expect(applyTransformation('collapse_spaces', {}, '  a b\tc\n d  ')).toBe(' a b\tc\n d ');
  });

  it('collapse_spaces is a no-op on empty input', () => {
    expect(applyTransformation('collapse_spaces', {}, '')).toBe('');
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

  it('replace returns original when find is not present in value (no-op)', () => {
    // "Find and replace" is a no-op when the target isn't in the input —
    // the original value carries through. Different from split_and_pick,
    // which is strict because finding the delimiter is its whole purpose.
    expect(applyTransformation('replace', { find: 'zebra', replaceWith: 'dog' }, 'cat')).toBe('cat');
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

  it('regex_replace returns original when pattern does not match (no-op)', () => {
    expect(applyTransformation('regex_replace', { pattern: '\\d+', replaceWith: '#' }, 'abc def')).toBe('abc def');
  });

  // --- starts_with_and_replace ---
  it('starts_with_and_replace swaps the prefix when the value starts with it', () => {
    expect(applyTransformation('starts_with_and_replace', { prefix: 'SRCACT//', replaceWith: 'ACC-' }, 'SRCACT//12345')).toBe('ACC-12345');
  });

  it('starts_with_and_replace deletes the prefix when replaceWith is empty', () => {
    expect(applyTransformation('starts_with_and_replace', { prefix: 'ABC', replaceWith: '' }, 'ABC123')).toBe('123');
  });

  it('starts_with_and_replace returns original when value does not start with prefix (no-op)', () => {
    expect(applyTransformation('starts_with_and_replace', { prefix: 'XYZ', replaceWith: 'Q' }, 'ABC123')).toBe('ABC123');
  });

  it('starts_with_and_replace returns original when prefix arg is missing', () => {
    expect(applyTransformation('starts_with_and_replace', { prefix: '', replaceWith: 'Q' }, 'ABC123')).toBe('ABC123');
  });

  it('starts_with_and_replace is case-sensitive (no match on case mismatch)', () => {
    expect(applyTransformation('starts_with_and_replace', { prefix: 'abc', replaceWith: 'X' }, 'ABC123')).toBe('ABC123');
  });

  it('starts_with_and_replace replaces the whole value when prefix equals the entire value', () => {
    expect(applyTransformation('starts_with_and_replace', { prefix: 'EXACT', replaceWith: 'NEW' }, 'EXACT')).toBe('NEW');
  });

  it('starts_with_and_replace returns original when prefix is longer than value', () => {
    expect(applyTransformation('starts_with_and_replace', { prefix: 'ABCDEF', replaceWith: 'X' }, 'ABC')).toBe('ABC');
  });

  it('starts_with_and_replace defaults replaceWith to empty string when omitted', () => {
    expect(applyTransformation('starts_with_and_replace', { prefix: 'ABC' }, 'ABC123')).toBe('123');
  });

  // --- ends_with_and_replace ---
  it('ends_with_and_replace swaps the suffix when the value ends with it', () => {
    expect(applyTransformation('ends_with_and_replace', { suffix: 'NMSC', replaceWith: '-X' }, '12345NMSC')).toBe('12345-X');
  });

  it('ends_with_and_replace deletes the suffix when replaceWith is empty', () => {
    expect(applyTransformation('ends_with_and_replace', { suffix: 'XYZ', replaceWith: '' }, '123XYZ')).toBe('123');
  });

  it('ends_with_and_replace returns original when value does not end with suffix (no-op)', () => {
    expect(applyTransformation('ends_with_and_replace', { suffix: 'XYZ', replaceWith: 'Q' }, '123ABC')).toBe('123ABC');
  });

  it('ends_with_and_replace returns original when suffix arg is missing', () => {
    expect(applyTransformation('ends_with_and_replace', { suffix: '', replaceWith: 'Q' }, '123ABC')).toBe('123ABC');
  });

  it('ends_with_and_replace is case-sensitive (no match on case mismatch)', () => {
    expect(applyTransformation('ends_with_and_replace', { suffix: 'abc', replaceWith: 'X' }, '123ABC')).toBe('123ABC');
  });

  it('ends_with_and_replace replaces the whole value when suffix equals the entire value', () => {
    expect(applyTransformation('ends_with_and_replace', { suffix: 'EXACT', replaceWith: 'NEW' }, 'EXACT')).toBe('NEW');
  });

  it('ends_with_and_replace returns original when suffix is longer than value', () => {
    expect(applyTransformation('ends_with_and_replace', { suffix: 'ABCDEF', replaceWith: 'X' }, 'DEF')).toBe('DEF');
  });

  it('ends_with_and_replace defaults replaceWith to empty string when omitted', () => {
    expect(applyTransformation('ends_with_and_replace', { suffix: 'XYZ' }, '123XYZ')).toBe('123');
  });

  // --- remove_spaces_and_line_breaks ---
  it('remove_spaces_and_line_breaks strips ASCII spaces', () => {
    expect(applyTransformation('remove_spaces_and_line_breaks', {}, 'A B C')).toBe('ABC');
  });

  it('remove_spaces_and_line_breaks strips line breaks (LF and CRLF)', () => {
    expect(applyTransformation('remove_spaces_and_line_breaks', {}, 'A\nB\r\nC')).toBe('ABC');
  });

  it('remove_spaces_and_line_breaks strips tabs along with other whitespace', () => {
    expect(applyTransformation('remove_spaces_and_line_breaks', {}, 'A\tB C')).toBe('ABC');
  });

  it('remove_spaces_and_line_breaks returns original when value has no whitespace', () => {
    expect(applyTransformation('remove_spaces_and_line_breaks', {}, 'ABC123')).toBe('ABC123');
  });

  it('remove_spaces_and_line_breaks returns empty when value is only whitespace', () => {
    expect(applyTransformation('remove_spaces_and_line_breaks', {}, '   \n\t  ')).toBe('');
  });

  // --- add_to_start ---
  it('add_to_start prepends text to the value', () => {
    expect(applyTransformation('add_to_start', { text: 'ACC-' }, '12345')).toBe('ACC-12345');
  });

  it('add_to_start prepends even when value is empty', () => {
    expect(applyTransformation('add_to_start', { text: 'X' }, '')).toBe('X');
  });

  it('add_to_start returns original when text arg is missing', () => {
    expect(applyTransformation('add_to_start', {}, 'ABC')).toBe('ABC');
  });

  it('add_to_start returns original when text arg is empty string', () => {
    expect(applyTransformation('add_to_start', { text: '' }, 'ABC')).toBe('ABC');
  });

  // --- append_at_end ---
  it('append_at_end appends text to the value', () => {
    expect(applyTransformation('append_at_end', { text: '-X' }, '12345')).toBe('12345-X');
  });

  it('append_at_end appends even when value is empty', () => {
    expect(applyTransformation('append_at_end', { text: 'X' }, '')).toBe('X');
  });

  it('append_at_end returns original when text arg is missing', () => {
    expect(applyTransformation('append_at_end', {}, 'ABC')).toBe('ABC');
  });

  it('append_at_end returns original when text arg is empty string', () => {
    expect(applyTransformation('append_at_end', { text: '' }, 'ABC')).toBe('ABC');
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

  it('date_reformat strips an ISO datetime time portion before splitting', () => {
    // Real bug: an extracted `2023-11-23T00:00:00Z` value would otherwise
    // split into ["2023", "11", "23T00:00:00Z"] and trap the time portion
    // into the day segment, producing `23T00:00:00Z-11-2023` on a
    // YYYY-MM-DD → DD-MM-YYYY reformat. Stripping at the `T` fixes it.
    expect(
      applyTransformation('date_reformat', { fromFormat: 'YYYY-MM-DD', toFormat: 'DD-MM-YYYY' }, '2023-11-23T00:00:00Z'),
    ).toBe('23-11-2023');
  });

  it('date_reformat strips a time portion before reformatting with slash separators', () => {
    expect(
      applyTransformation('date_reformat', { fromFormat: 'YYYY-MM-DD', toFormat: 'MM/DD/YYYY' }, '2024-12-25T08:30:00Z'),
    ).toBe('12/25/2024');
  });

  it('date_reformat leaves a bare date untouched when no time portion is present', () => {
    expect(
      applyTransformation('date_reformat', { fromFormat: 'YYYY-MM-DD', toFormat: 'DD-MM-YYYY' }, '2023-11-23'),
    ).toBe('23-11-2023');
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

  it('split_and_pick returns empty string when delimiter is empty', () => {
    expect(applyTransformation('split_and_pick', { delimiter: '', index: '0' }, 'ABC')).toBe('');
  });

  it('split_and_pick returns empty string when delimiter is not present in value', () => {
    expect(applyTransformation('split_and_pick', { delimiter: '-', index: '1' }, 'CFT0001222454NMSC')).toBe('');
  });

  it('split_and_pick returns empty string at index 0 when delimiter is not present (the JS split([orig]) trap)', () => {
    // JS `'NCBK82423324AMRG'.split('9')` returns `['NCBK82423324AMRG']`, so
    // a naive `parts[0]` would leak the original full field. Guard ensures
    // index 0 still returns '' when the delimiter never appears.
    expect(applyTransformation('split_and_pick', { delimiter: '9', index: '0' }, 'NCBK82423324AMRG')).toBe('');
  });

  it('split_and_pick passes the input through unchanged when index is missing', () => {
    // index is required — an empty value used to silently coerce to 0 and
    // produce a real-looking result (the in-builder preview / inline Save
    // gate would lie). Now the transformation is a no-op until the
    // operator fills the field; the save gate (isCompleteAttribute) also
    // blocks persistence of this state.
    expect(applyTransformation('split_and_pick', { delimiter: '/', index: '' }, 'A/B/C')).toBe('A/B/C');
    expect(applyTransformation('split_and_pick', { delimiter: '9', index: '' }, 'NCBK82423324AMRG')).toBe('NCBK82423324AMRG');
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

  // --- Dedupe ---
  it('dedupe collapses a perfectly doubled uppercase-alphanumeric string', () => {
    expect(applyTransformation('dedupe', {}, 'ABC123ABC123')).toBe('ABC123');
  });

  it('dedupe handles digits-only doubled values', () => {
    expect(applyTransformation('dedupe', {}, '12341234')).toBe('1234');
  });

  it('dedupe handles letters-only doubled values', () => {
    expect(applyTransformation('dedupe', {}, 'ACMEACME')).toBe('ACME');
  });

  it('dedupe collapses a back-to-back repeated phrase (spaces and lowercase inside the phrase)', () => {
    expect(applyTransformation('dedupe', {}, 'Potato is GreatPotato is Great')).toBe('Potato is Great');
  });

  it('dedupe collapses a space-separated repeated phrase', () => {
    expect(applyTransformation('dedupe', {}, 'Potato is Great Potato is Great')).toBe('Potato is Great');
  });

  it('dedupe collapses an odd repetition count to a single copy', () => {
    expect(applyTransformation('dedupe', {}, 'Potato is Great Potato is Great Potato is Great')).toBe('Potato is Great');
  });

  it('dedupe picks the LARGEST repeating unit (backend iterates n/2 down)', () => {
    // Mirrors the backend's DedupeRepeatedValue exactly: a ×4 phrase is first
    // seen as a clean ×2 of the DOUBLED phrase, so it collapses to ×2, not
    // ×1. Degenerate runs behave the same ("AAAA" → "AA").
    expect(applyTransformation('dedupe', {}, 'Ref 91 Ref 91 Ref 91 Ref 91')).toBe('Ref 91 Ref 91');
    expect(applyTransformation('dedupe', {}, 'AAAA')).toBe('AA');
  });

  it('dedupe allows ANY whitespace run between repeats (backend skips whitespace)', () => {
    expect(applyTransformation('dedupe', {}, 'AB  AB')).toBe('AB');
    expect(applyTransformation('dedupe', {}, 'ABC123\tABC123')).toBe('ABC123');
    expect(applyTransformation('dedupe', {}, 'ABC123\nABC123')).toBe('ABC123');
  });

  it('dedupe trims the value first and returns the trimmed segment on success', () => {
    expect(applyTransformation('dedupe', {}, '  ABC123ABC123  ')).toBe('ABC123');
  });

  it('dedupe is a no-op when the value is not a perfect repetition', () => {
    expect(applyTransformation('dedupe', {}, 'ABC123ABC124')).toBe('ABC123ABC124');
    expect(applyTransformation('dedupe', {}, 'ABC')).toBe('ABC');
    // Trailing partial echo invalidates the candidate — untouched, and the
    // ORIGINAL (untrimmed) value comes back on failure.
    expect(applyTransformation('dedupe', {}, 'Potato is Great Potato is Great!')).toBe('Potato is Great Potato is Great!');
    expect(applyTransformation('dedupe', {}, ' ABC ')).toBe(' ABC ');
  });

  it('dedupe is case-sensitive — repeats must be byte-identical', () => {
    expect(applyTransformation('dedupe', {}, 'abc123ABC123')).toBe('abc123ABC123');
    expect(applyTransformation('dedupe', {}, 'abc123abc123')).toBe('abc123');
  });

  it('dedupe leaves empty and whitespace-only strings unchanged', () => {
    expect(applyTransformation('dedupe', {}, '')).toBe('');
    expect(applyTransformation('dedupe', {}, '   ')).toBe('   ');
  });

  // --- Remove Leading Zeros ---
  it('remove_leading_zeros strips leading zeros from a numeric string', () => {
    expect(applyTransformation('remove_leading_zeros', {}, '00012345')).toBe('12345');
  });

  it('remove_leading_zeros keeps a single trailing zero when value is all zeros', () => {
    expect(applyTransformation('remove_leading_zeros', {}, '0000')).toBe('0');
  });

  it('remove_leading_zeros is a no-op when there are no leading zeros', () => {
    expect(applyTransformation('remove_leading_zeros', {}, '12345')).toBe('12345');
  });

  it('remove_leading_zeros only strips leading zeros, preserving inner / trailing zeros', () => {
    expect(applyTransformation('remove_leading_zeros', {}, '00010200')).toBe('10200');
  });

  it('remove_leading_zeros is a no-op for non-digit-led values', () => {
    expect(applyTransformation('remove_leading_zeros', {}, 'ABC123')).toBe('ABC123');
  });

  // --- take_first_n_chars / take_last_n_chars ---
  it('take_first_n_chars returns the leading N characters', () => {
    expect(applyTransformation('take_first_n_chars', { length: '4' }, 'ABCDEFG')).toBe('ABCD');
  });

  it('take_first_n_chars clamps when N exceeds value length', () => {
    expect(applyTransformation('take_first_n_chars', { length: '50' }, 'ABC')).toBe('ABC');
  });

  it('take_first_n_chars returns empty for N <= 0', () => {
    expect(applyTransformation('take_first_n_chars', { length: '0' }, 'ABC')).toBe('');
    expect(applyTransformation('take_first_n_chars', { length: '-3' }, 'ABC')).toBe('');
  });

  it('take_first_n_chars returns empty when length is missing or non-numeric', () => {
    expect(applyTransformation('take_first_n_chars', {}, 'ABC')).toBe('');
    expect(applyTransformation('take_first_n_chars', { length: 'abc' }, 'ABC')).toBe('');
  });

  it('take_last_n_chars returns the trailing N characters', () => {
    expect(applyTransformation('take_last_n_chars', { length: '3' }, 'ABCDEFG')).toBe('EFG');
  });

  it('take_last_n_chars clamps when N exceeds value length', () => {
    expect(applyTransformation('take_last_n_chars', { length: '50' }, 'ABC')).toBe('ABC');
  });

  it('take_last_n_chars returns empty for N <= 0', () => {
    expect(applyTransformation('take_last_n_chars', { length: '0' }, 'ABC')).toBe('');
    expect(applyTransformation('take_last_n_chars', { length: '-3' }, 'ABC')).toBe('');
  });

  // --- remove_first_n_chars / remove_last_n_chars ---
  it('remove_first_n_chars drops the leading N characters', () => {
    expect(applyTransformation('remove_first_n_chars', { length: '3' }, 'ABCDEFG')).toBe('DEFG');
  });

  it('remove_first_n_chars returns empty string when N >= value length', () => {
    expect(applyTransformation('remove_first_n_chars', { length: '50' }, 'ABC')).toBe('');
    expect(applyTransformation('remove_first_n_chars', { length: '3' }, 'ABC')).toBe('');
  });

  it('remove_first_n_chars passes value through for N <= 0 or missing length', () => {
    // Nothing to drop → identity.
    expect(applyTransformation('remove_first_n_chars', { length: '0' }, 'ABC')).toBe('ABC');
    expect(applyTransformation('remove_first_n_chars', { length: '-3' }, 'ABC')).toBe('ABC');
    expect(applyTransformation('remove_first_n_chars', {}, 'ABC')).toBe('ABC');
    expect(applyTransformation('remove_first_n_chars', { length: 'abc' }, 'ABC')).toBe('ABC');
  });

  it('remove_last_n_chars drops the trailing N characters', () => {
    expect(applyTransformation('remove_last_n_chars', { length: '3' }, 'ABCDEFG')).toBe('ABCD');
  });

  it('remove_last_n_chars returns empty string when N >= value length', () => {
    expect(applyTransformation('remove_last_n_chars', { length: '50' }, 'ABC')).toBe('');
    expect(applyTransformation('remove_last_n_chars', { length: '3' }, 'ABC')).toBe('');
  });

  it('remove_last_n_chars passes value through for N <= 0 or missing length', () => {
    expect(applyTransformation('remove_last_n_chars', { length: '0' }, 'ABC')).toBe('ABC');
    expect(applyTransformation('remove_last_n_chars', { length: '-3' }, 'ABC')).toBe('ABC');
    expect(applyTransformation('remove_last_n_chars', {}, 'ABC')).toBe('ABC');
  });

  it('remove_first_n_chars + take_first_n_chars partition the string at position N', () => {
    // Behavior witness: applying take_first(N) and remove_first(N) to
    // the same input gives the prefix and suffix exactly, with no
    // overlap or gap.
    const value = 'ABCDEFG';
    const n = '3';
    const prefix = applyTransformation('take_first_n_chars', { length: n }, value);
    const suffix = applyTransformation('remove_first_n_chars', { length: n }, value);
    expect(prefix + suffix).toBe(value);
  });

  // --- replaceWith empty string ---
  it('replace deletes the matched text when replaceWith is an empty string', () => {
    // Operators routinely want to delete a noise prefix / suffix by
    // setting Replace With to empty. The runtime already coalesces an
    // undefined replaceWith to ''; this assertion locks in the explicit
    // "" case so the save / preview gate honors the same intent.
    expect(applyTransformation('replace', { find: 'NMSC', replaceWith: '' }, 'NMSC12345')).toBe('12345');
  });

  it('regex_replace deletes regex matches when replaceWith is an empty string', () => {
    expect(applyTransformation('regex_replace', { pattern: '\\d+', replaceWith: '' }, 'abc 123 def 456')).toBe('abc  def ');
  });

  it('starts_with_and_replace strips a matched prefix when replaceWith is empty', () => {
    expect(applyTransformation('starts_with_and_replace', { prefix: 'SRCACT//', replaceWith: '' }, 'SRCACT//12345')).toBe('12345');
  });

  it('ends_with_and_replace strips a matched suffix when replaceWith is empty', () => {
    expect(applyTransformation('ends_with_and_replace', { suffix: 'NMSC', replaceWith: '' }, '12345NMSC')).toBe('12345');
  });

  // --- Unknown method ---
  it('returns original value for unknown method', () => {
    expect(applyTransformation('nonexistent', {}, 'hello')).toBe('hello');
  });
});

describe('applyTransformationPipeline incompleteness handling', () => {
  it('stops the pipeline at the first transformation with a missing required arg', () => {
    // Split & Pick with an empty index used to silently default to 0
    // and surface a real-looking result in the in-builder preview. The
    // pipeline now stops at the incomplete row so no misleading output
    // renders, and subsequent steps are dropped (running them on a
    // not-yet-defined input would compound the misleading state).
    const transformations: TransformationFormValue[] = [
      { id: '1', method: 'trim', args: {} },
      { id: '2', method: 'split_and_pick', args: { delimiter: 'A', index: '' } },
      { id: '3', method: 'to_uppercase', args: {} },
    ];
    const steps = applyTransformationPipeline(transformations, '  BTBA00237241223  ');
    expect(steps).toHaveLength(1);
    expect(steps[0].method).toBe('trim');
    expect(steps[0].result).toBe('BTBA00237241223');
  });

  it('stops the pipeline when the very first transformation is incomplete', () => {
    const transformations: TransformationFormValue[] = [
      { id: '1', method: 'split_and_pick', args: { delimiter: 'A', index: '' } },
      { id: '2', method: 'to_uppercase', args: {} },
    ];
    const steps = applyTransformationPipeline(transformations, 'BTBA00237241223');
    expect(steps).toHaveLength(0);
  });

  it('treats an empty method as incomplete and stops there', () => {
    // The row was just added via "+ Add Transformation" but the operator
    // hasn't picked a method yet — preview should be empty.
    const transformations: TransformationFormValue[] = [
      { id: '1', method: 'trim', args: {} },
      { id: '2', method: '', args: {} },
    ];
    const steps = applyTransformationPipeline(transformations, '  hello  ');
    expect(steps).toHaveLength(1);
    expect(steps[0].method).toBe('trim');
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
    const transformations: TransformationFormValue[] = [
      { id: '1', method: 'to_uppercase', args: {} },
      { id: '2', method: 'max_char_limit', args: { length: '5', breakAtSpecial: 'true' } },
    ];
    const steps = applyTransformationPipeline(transformations, 'hello world');
    expect(steps[0].result).toBe('HELLO WORLD');
    expect(steps[1].result).toBe('HELLO');
  });
});
