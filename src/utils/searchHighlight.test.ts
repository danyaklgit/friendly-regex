import { describe, it, expect } from 'vitest';
import { highlightSegments } from './searchHighlight';

describe('highlightSegments', () => {
  it('returns an empty array for empty text', () => {
    expect(highlightSegments('', 'foo')).toEqual([]);
  });

  it('returns one non-match segment for an empty query', () => {
    expect(highlightSegments('hello world', '')).toEqual([
      { text: 'hello world', match: false },
    ]);
  });

  it('returns one non-match segment for a whitespace-only query', () => {
    expect(highlightSegments('hello world', '   ')).toEqual([
      { text: 'hello world', match: false },
    ]);
  });

  it('matches case-insensitively and preserves source casing', () => {
    expect(highlightSegments('Hello WORLD', 'world')).toEqual([
      { text: 'Hello ', match: false },
      { text: 'WORLD', match: true },
    ]);
  });

  it('captures multiple occurrences as separate match segments', () => {
    expect(highlightSegments('foo bar foo baz foo', 'foo')).toEqual([
      { text: 'foo', match: true },
      { text: ' bar ', match: false },
      { text: 'foo', match: true },
      { text: ' baz ', match: false },
      { text: 'foo', match: true },
    ]);
  });

  it('returns one non-match segment when nothing matches', () => {
    expect(highlightSegments('lorem ipsum', 'xyz')).toEqual([
      { text: 'lorem ipsum', match: false },
    ]);
  });

  it('treats regex metacharacters in the query as literals', () => {
    // ".*" should match the literal substring ".*" in the source, not act as
    // a regex wildcard. This is the ReDoS / wildcard defence.
    expect(highlightSegments('a.*b', '.*')).toEqual([
      { text: 'a', match: false },
      { text: '.*', match: true },
      { text: 'b', match: false },
    ]);
  });

  it('does not match a regex pattern that the query happens to look like', () => {
    // "(foo|bar)" should NOT match "foo" or "bar" because we escape parens
    // and the pipe.
    expect(highlightSegments('foo bar', '(foo|bar)')).toEqual([
      { text: 'foo bar', match: false },
    ]);
  });

  it('handles adjacent matches', () => {
    expect(highlightSegments('abab', 'ab')).toEqual([
      { text: 'ab', match: true },
      { text: 'ab', match: true },
    ]);
  });
});
