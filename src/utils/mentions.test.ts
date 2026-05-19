import { describe, it, expect } from 'vitest';
import {
  renderCommentSegments,
  dedupeMentionIds,
  getInitials,
  getAvatarColour,
} from './mentions';

describe('renderCommentSegments', () => {
  const resolver = (id: string): string | undefined => {
    const map: Record<string, string> = {
      'u1': 'Alice Smith',
      'u2': 'Bob',
      'u3': 'Alice', // shorter prefix of "Alice Smith"
    };
    return map[id];
  };

  it('returns a single text segment when there are no mentions', () => {
    expect(renderCommentSegments('Hello world', [], resolver)).toEqual([
      { type: 'text', text: 'Hello world' },
    ]);
  });

  it('returns an empty array for empty text', () => {
    expect(renderCommentSegments('', ['u1'], resolver)).toEqual([]);
  });

  it('converts @DisplayName into a mention segment', () => {
    expect(renderCommentSegments('hi @Bob there', ['u2'], resolver)).toEqual([
      { type: 'text', text: 'hi ' },
      { type: 'mention', userId: 'u2', displayName: 'Bob' },
      { type: 'text', text: ' there' },
    ]);
  });

  it('prefers the longer match when display names share a prefix', () => {
    const result = renderCommentSegments('@Alice Smith ping', ['u1', 'u3'], resolver);
    expect(result[0]).toEqual({ type: 'mention', userId: 'u1', displayName: 'Alice Smith' });
  });

  it('falls through to plain text when the @ does not match any known display name', () => {
    expect(renderCommentSegments('@Unknown user', ['u1'], resolver)).toEqual([
      { type: 'text', text: '@' },
      { type: 'text', text: 'Unknown user' },
    ]);
  });

  it('leaves @ alone when the resolver returns nothing for the id', () => {
    expect(renderCommentSegments('hi @Ghost', ['gone'], () => undefined)).toEqual([
      { type: 'text', text: 'hi ' },
      { type: 'text', text: '@' },
      { type: 'text', text: 'Ghost' },
    ]);
  });
});

describe('dedupeMentionIds', () => {
  it('preserves order and removes duplicates', () => {
    expect(dedupeMentionIds(['u1', 'u2', 'u1', 'u3', 'u2'])).toEqual(['u1', 'u2', 'u3']);
  });
  it('returns [] for empty input', () => {
    expect(dedupeMentionIds([])).toEqual([]);
  });
});

describe('getInitials', () => {
  it('uses first and last name initials', () => {
    expect(getInitials('Alice Smith')).toBe('AS');
  });
  it('uses the first two letters of a single-word name', () => {
    expect(getInitials('Bob')).toBe('BO');
  });
  it('returns ? for empty input', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials('   ')).toBe('?');
  });
});

describe('getAvatarColour', () => {
  it('returns the same colour for the same user id', () => {
    expect(getAvatarColour('user-1')).toBe(getAvatarColour('user-1'));
  });
  it('returns a Tailwind bg class', () => {
    expect(getAvatarColour('user-1')).toMatch(/^bg-[a-z]+-\d{3}$/);
  });
  it('handles an empty id', () => {
    expect(getAvatarColour('')).toMatch(/^bg-/);
  });
});
