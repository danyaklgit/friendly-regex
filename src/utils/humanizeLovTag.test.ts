import { describe, it, expect } from 'vitest';
import { humanizeLovTag } from './humanizeLovTag';

describe('humanizeLovTag', () => {
  it('title-cases a single all-caps word', () => {
    expect(humanizeLovTag('BANKS')).toBe('Banks');
  });

  it('handles two-word snake_case', () => {
    expect(humanizeLovTag('SADAD_BILLERS')).toBe('Sadad Billers');
  });

  it('handles three-word snake_case', () => {
    expect(humanizeLovTag('SADAD_GOVERNMENT_SERVICES')).toBe('Sadad Government Services');
  });

  it('returns empty string for empty input', () => {
    expect(humanizeLovTag('')).toBe('');
  });

  it('handles already-mixed casing', () => {
    expect(humanizeLovTag('Sadad_billers')).toBe('Sadad Billers');
  });

  it('collapses repeated separators', () => {
    expect(humanizeLovTag('FOO__BAR')).toBe('Foo Bar');
  });

  it('treats hyphens and spaces as separators', () => {
    expect(humanizeLovTag('FOO-BAR BAZ')).toBe('Foo Bar Baz');
  });
});
