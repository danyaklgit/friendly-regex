import { describe, it, expect } from 'vitest';
import { formatCount, formatRate, formatAsOf, formatAsOfFull, formatRangeCaption } from './format';

describe('format', () => {
  it('formatCount uses en-US thousands separators', () => {
    expect(formatCount(108910)).toBe('108,910');
    expect(formatCount(0)).toBe('0');
  });

  it('formatRate defaults to one decimal and accepts two', () => {
    expect(formatRate(46.48)).toBe('46.5%');
    expect(formatRate(46.48, 2)).toBe('46.48%');
    expect(formatRate(0)).toBe('0.0%');
  });

  it('formatAsOf renders HH:mm in the given zone and blanks invalid input', () => {
    expect(formatAsOf('2026-09-28T07:46:58Z', 'UTC')).toBe('07:46');
    expect(formatAsOf('2026-09-28T07:46:58Z', 'Asia/Riyadh')).toBe('10:46');
    expect(formatAsOf('2026-09-28T00:05:00Z', 'UTC')).toBe('00:05');
    expect(formatAsOf('nope')).toBe('');
    expect(formatAsOf('')).toBe('');
  });

  it('formatAsOfFull is always UTC', () => {
    expect(formatAsOfFull('2026-09-28T07:46:58Z')).toBe('2026-09-28 07:46:58 UTC');
    expect(formatAsOfFull('nope')).toBe('');
  });

  it('formatRangeCaption covers every range shape', () => {
    expect(formatRangeCaption('Business periods', '2022-07-18', '2026-09-27', 'Month', 'Operator view'))
      .toBe('Business periods 2022-07-18 to 2026-09-27 · by month · Operator view');
    expect(formatRangeCaption('Activity periods', '2026-05-27', '2026-09-25', 'Week'))
      .toBe('Activity periods 2026-05-27 to 2026-09-25 · by week');
    expect(formatRangeCaption('Business periods', '2022-07-18', '', 'Year')).toBe('Business periods from 2022-07-18 · by year');
    expect(formatRangeCaption('Business periods', '', '2026-09-27', 'Day')).toBe('Business periods to 2026-09-27 · by day');
    expect(formatRangeCaption('Business periods', '', '', 'Day')).toBe('Business periods all history · by day');
  });
});
