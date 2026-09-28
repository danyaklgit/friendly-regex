import { describe, it, expect } from 'vitest';
import {
  parseIsoDateUtc, formatIsoDateUtc, addDaysIso, addPeriod, periodEndFor, periodStartOf, fillPeriodGaps,
} from './periods';
import type { TaggingGranularity } from '../../api/taggingReportsShared';

describe('parseIsoDateUtc / formatIsoDateUtc', () => {
  it('round-trips a valid date as a UTC midnight instant regardless of the process TZ', () => {
    const d = parseIsoDateUtc('2024-03-05');
    expect(d?.toISOString()).toBe('2024-03-05T00:00:00.000Z');
    expect(formatIsoDateUtc(d!)).toBe('2024-03-05');
  });

  it.each(['2024-02-31', '2024-13-01', '24-01-01', '2024-1-5', '', 'March 5'])('rejects %j', (s) => {
    expect(parseIsoDateUtc(s)).toBeNull();
  });
});

describe('addDaysIso', () => {
  it.each([
    ['2026-09-28', -29, '2026-08-30'],
    ['2026-09-28', -89, '2026-07-01'],
    ['2024-03-01', -1, '2024-02-29'],
    ['2024-12-31', 1, '2025-01-01'],
    ['bad', 3, 'bad'],
  ])('addDaysIso(%s, %i) = %s', (iso, days, expected) => {
    expect(addDaysIso(iso, days)).toBe(expected);
  });
});

describe('addPeriod', () => {
  it.each<[string, TaggingGranularity, string]>([
    ['2024-02-28', 'Day', '2024-02-29'],
    ['2023-02-28', 'Day', '2023-03-01'],
    ['2024-12-31', 'Day', '2025-01-01'],
    ['2026-09-20', 'Week', '2026-09-27'],
    ['2024-12-29', 'Week', '2025-01-05'],
    ['2024-01-01', 'Month', '2024-02-01'],
    ['2024-12-01', 'Month', '2025-01-01'],
    ['2024-01-31', 'Month', '2024-02-01'],
    ['2024-01-01', 'Year', '2025-01-01'],
    ['2024-06-15', 'Year', '2025-01-01'],
    ['nope', 'Day', 'nope'],
  ])('addPeriod(%s, %s) = %s', (start, g, expected) => {
    expect(addPeriod(start, g)).toBe(expected);
  });
});

describe('periodEndFor', () => {
  it.each<[string, TaggingGranularity, string]>([
    ['2024-03-05', 'Day', '2024-03-05'],
    ['2026-09-20', 'Week', '2026-09-26'],
    ['2024-02-01', 'Month', '2024-02-29'],
    ['2023-02-01', 'Month', '2023-02-28'],
    ['2024-12-01', 'Month', '2024-12-31'],
    ['2024-01-01', 'Year', '2024-12-31'],
  ])('periodEndFor(%s, %s) = %s', (start, g, expected) => {
    expect(periodEndFor(start, g)).toBe(expected);
  });
});

describe('periodStartOf', () => {
  it.each<[string, TaggingGranularity, string]>([
    ['2026-09-28', 'Day', '2026-09-28'],
    ['2026-09-28', 'Week', '2026-09-27'], // Monday -> preceding Sunday
    ['2026-09-27', 'Week', '2026-09-27'], // Sunday stays
    ['2026-10-03', 'Week', '2026-09-27'], // Saturday -> previous Sunday, across a month edge
    ['2026-09-28', 'Month', '2026-09-01'],
    ['2026-09-28', 'Year', '2026-01-01'],
    ['bad', 'Month', 'bad'],
  ])('periodStartOf(%s, %s) = %s', (iso, g, expected) => {
    expect(periodStartOf(iso, g)).toBe(expected);
  });
});

describe('fillPeriodGaps', () => {
  it('returns the input when there are no gaps', () => {
    expect(fillPeriodGaps(['2024-01-01', '2024-02-01'], 'Month')).toEqual(['2024-01-01', '2024-02-01']);
  });

  it('fills missing months, weeks, and days', () => {
    expect(fillPeriodGaps(['2024-01-01', '2024-04-01'], 'Month')).toEqual(['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01']);
    expect(fillPeriodGaps(['2026-09-06', '2026-09-27'], 'Week')).toEqual(['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']);
    expect(fillPeriodGaps(['2024-02-28', '2024-03-01'], 'Day')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
    expect(fillPeriodGaps(['2022-01-01', '2025-01-01'], 'Year')).toEqual(['2022-01-01', '2023-01-01', '2024-01-01', '2025-01-01']);
  });

  it('sorts and de-duplicates the input and drops invalid entries', () => {
    expect(fillPeriodGaps(['2024-03-01', 'junk', '2024-01-01', '2024-03-01'], 'Month')).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
  });

  it('re-anchors on a misaligned period instead of dropping it or looping', () => {
    expect(fillPeriodGaps(['2024-01-01', '2024-02-15', '2024-03-01'], 'Month')).toEqual(['2024-01-01', '2024-02-01', '2024-02-15', '2024-03-01']);
  });

  it('handles single and empty inputs', () => {
    expect(fillPeriodGaps(['2024-01-01'], 'Day')).toEqual(['2024-01-01']);
    expect(fillPeriodGaps([], 'Day')).toEqual([]);
  });
});
