import { describe, it, expect } from 'vitest';
import { formatPeriodAxisLabel, formatPeriodFullLabel, GRANULARITY_LABELS, LAYER_LABELS } from './labels';
import type { TaggingGranularity } from '../../api/taggingReportsShared';

describe('labels', () => {
  it('exposes the control labels', () => {
    expect(GRANULARITY_LABELS).toEqual({ Day: 'Day', Week: 'Week', Month: 'Month', Year: 'Year' });
    expect(LAYER_LABELS).toEqual({ Ops: 'Operator view', Active: 'Published' });
  });

  it.each<[string, TaggingGranularity, string]>([
    ['2024-03-05', 'Day', '2024-03-05'],
    ['2024-03-03', 'Week', '2024-03-03'],
    ['2024-03-01', 'Month', 'Mar 2024'],
    ['2024-01-01', 'Year', '2024'],
    ['garbage', 'Month', 'garbage'],
  ])('axis label for %s at %s is %s', (start, g, expected) => {
    expect(formatPeriodAxisLabel(start, g)).toBe(expected);
  });

  it.each<[string, string, TaggingGranularity, string]>([
    ['2024-03-05', '2024-03-05', 'Day', '2024-03-05'],
    ['2024-03-03', '2024-03-09', 'Week', 'Week of 2024-03-03 to 2024-03-09'],
    ['2024-03-01', '2024-03-31', 'Month', 'March 2024'],
    ['2024-01-01', '2024-12-31', 'Year', '2024'],
    ['2024-13-01', '2024-13-31', 'Month', '? 2024'],
  ])('full label for %s..%s at %s is %s', (start, end, g, expected) => {
    expect(formatPeriodFullLabel(start, end, g)).toBe(expected);
  });
});
