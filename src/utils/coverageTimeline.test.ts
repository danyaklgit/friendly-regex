import { describe, it, expect } from 'vitest';
import { buildCoverageTimeline } from './coverageTimeline';

describe('buildCoverageTimeline', () => {
  it('returns null when no range parses', () => {
    expect(buildCoverageTimeline([])).toBeNull();
    expect(buildCoverageTimeline([{ from: null, to: null }, { from: 'nope', to: '' }])).toBeNull();
  });

  it('spans whole months across every rule range', () => {
    const tl = buildCoverageTimeline([
      { from: '2024-08-20', to: '2024-12-05' },
      { from: '2024-10-15', to: '2025-02-16' },
    ])!;
    // Aug 2024 .. Feb 2025 = 7 month columns.
    expect(tl.months.map((m) => m.key)).toEqual([
      '2024-08', '2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02',
    ]);
    expect(tl.months[0].label).toBe('Aug 24');
    expect(tl.months[6].label).toBe('Feb 25');
    // Month widths sum to ~100%.
    const sum = tl.months.reduce((acc, m) => acc + m.widthPct, 0);
    expect(sum).toBeCloseTo(100, 6);
    // Narrow range → every month labeled.
    expect(tl.months.every((m) => m.labeled)).toBe(true);
  });

  it('positions bars with day precision, inclusive of the end day', () => {
    const tl = buildCoverageTimeline([{ from: '2024-01-01', to: '2024-01-31' }])!;
    // Single January: full-month bar.
    const bar = tl.barFor('2024-01-01', '2024-01-31')!;
    expect(bar.leftPct).toBeCloseTo(0, 6);
    expect(bar.widthPct).toBeCloseTo(100, 6);
    // A single day is still visible (1/31 of the scale).
    const day = tl.barFor('2024-01-16', '2024-01-16')!;
    expect(day.widthPct).toBeCloseTo(100 / 31, 6);
    expect(day.leftPct).toBeCloseTo((15 / 31) * 100, 6);
  });

  it('thins labels on wide ranges but keeps a gridline per month', () => {
    const tl = buildCoverageTimeline([{ from: '2022-07-18', to: '2025-02-16' }], 12)!;
    expect(tl.months.length).toBe(32);
    const labeled = tl.months.filter((m) => m.labeled);
    expect(labeled.length).toBeLessThanOrEqual(12);
    expect(tl.months[0].labeled).toBe(true); // anchor on the first month
  });

  it('clamps bars to the scale and rejects unparsable input', () => {
    const tl = buildCoverageTimeline([{ from: '2024-02-01', to: '2024-03-31' }])!;
    expect(tl.barFor('bad', '2024-03-01')).toBeNull();
    const clamped = tl.barFor('2024-01-15', '2024-02-05')!; // starts before the scale
    expect(clamped.leftPct).toBeCloseTo(0, 6);
  });
});
