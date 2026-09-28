import { describe, it, expect } from 'vitest';
import {
  rateOf, sumMetrics, buildPeriodRows, toCoverageData, toFeedRateData, rateDataKey, isDenseAxis, DENSE_AXIS_THRESHOLD,
} from './aggregate';
import { makeReportFixture, metrics, point } from './fixtures';
import { ZERO_METRICS, type TaggingProgressReport } from '../../api/taggingProgress';

describe('rateOf', () => {
  it('is 0 for an empty total and two decimals otherwise', () => {
    expect(rateOf(0, 0)).toBe(0);
    expect(rateOf(5, 0)).toBe(0);
    expect(rateOf(1, 3)).toBe(33.33);
    expect(rateOf(72, 74)).toBe(97.3);
  });
});

describe('sumMetrics', () => {
  it('returns a single entry verbatim, keeping the backend rate even when the counts disagree', () => {
    const only = metrics({ TotalTransactionCount: 3, TotalTaggedCount: 1, TaggingRate: 50 });
    expect(sumMetrics([only])).toEqual(only);
    expect(sumMetrics([only])).not.toBe(only);
  });

  it('sums every count and recomputes the rate with the backend formula', () => {
    const a = metrics({ TotalTransactionCount: 1000, TotalTaggedCount: 400, UntaggedCount: 600, IssuesCount: 5, DeadEndCount: 1, TaggingRate: 40 });
    const b = metrics({ TotalTransactionCount: 100, TotalTaggedCount: 10, UntaggedCount: 90, IssuesCount: 2, TaggingRate: 10 });
    expect(sumMetrics([a, b])).toEqual(metrics({ TotalTransactionCount: 1100, TotalTaggedCount: 410, UntaggedCount: 690, IssuesCount: 7, DeadEndCount: 1, TaggingRate: 37.27 }));
  });

  it('returns zeros for an empty list', () => {
    expect(sumMetrics([])).toEqual(ZERO_METRICS);
  });
});

describe('buildPeriodRows', () => {
  it('produces one row per period across feeds, with per-feed points and summed metrics', () => {
    const rows = buildPeriodRows(makeReportFixture());
    expect(rows.map((r) => r.periodStart)).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
    const jan = rows[0];
    expect(jan.axisLabel).toBe('Jan 2024');
    expect(jan.fullLabel).toBe('January 2024');
    expect(jan.backendLabel).toBe('Jan 2024');
    expect(jan.periodEnd).toBe('2024-01-31');
    expect(jan.perFeed.MT940?.TotalTransactionCount).toBe(1000);
    expect(jan.perFeed.Ledger?.TotalTransactionCount).toBe(100);
    expect(jan.metrics).toEqual(expect.objectContaining({ TotalTransactionCount: 1100, TotalTaggedCount: 410, TaggingRate: 37.27, IssuesCount: 5 }));
  });

  it('passes a single present feed through verbatim (backend rate preserved)', () => {
    const feb = buildPeriodRows(makeReportFixture())[1];
    expect(feb.perFeed.Ledger).toBeNull();
    expect(feb.metrics?.TaggingRate).toBe(50);
    expect(feb.metrics?.TotalTransactionCount).toBe(2000);
  });

  it('fills a period no feed has as a gap row with derived labels and null metrics', () => {
    const report: TaggingProgressReport = {
      ...makeReportFixture(),
      Series: [{ DataSetType: 'MT940', Points: [point('2024-01-01', '2024-01-31', 'Jan 2024', 10, 5), point('2024-03-01', '2024-03-31', 'Mar 2024', 10, 5)], Totals: metrics() }],
    };
    const rows = buildPeriodRows(report);
    expect(rows).toHaveLength(3);
    const gap = rows[1];
    expect(gap.periodStart).toBe('2024-02-01');
    expect(gap.periodEnd).toBe('2024-02-29');
    expect(gap.fullLabel).toBe('February 2024');
    expect(gap.backendLabel).toBeNull();
    expect(gap.metrics).toBeNull();
    expect(gap.perFeed).toEqual({ MT940: null });
  });

  it('keeps the last point when a series repeats a PeriodStart and ignores input order', () => {
    const report: TaggingProgressReport = {
      ...makeReportFixture(),
      Series: [{
        DataSetType: 'MT940',
        Points: [
          point('2024-02-01', '2024-02-29', 'Feb 2024', 10, 5),
          point('2024-01-01', '2024-01-31', 'Jan 2024', 10, 5),
          point('2024-01-01', '2024-01-31', 'Jan 2024 (restated)', 20, 10),
        ],
        Totals: metrics(),
      }],
    };
    const rows = buildPeriodRows(report);
    expect(rows.map((r) => r.periodStart)).toEqual(['2024-01-01', '2024-02-01']);
    expect(rows[0].metrics?.TotalTransactionCount).toBe(20);
    expect(rows[0].backendLabel).toBe('Jan 2024 (restated)');
  });

  it('returns no rows for an empty report', () => {
    expect(buildPeriodRows({ ...makeReportFixture(), Series: [] })).toEqual([]);
  });
});

describe('chart data', () => {
  it('toCoverageData maps rows to tagged/untagged/total/rate with zeros on gaps', () => {
    const rows = buildPeriodRows({
      ...makeReportFixture(),
      Series: [{ DataSetType: 'MT940', Points: [point('2024-01-01', '2024-01-31', 'Jan 2024', 10, 4), point('2024-03-01', '2024-03-31', 'Mar 2024', 10, 5)], Totals: metrics() }],
    });
    const data = toCoverageData(rows);
    expect(data[0]).toEqual({ periodStart: '2024-01-01', axisLabel: 'Jan 2024', fullLabel: 'January 2024', title: 'Jan 2024', untagged: 6, tagged: 4, total: 10, rate: 40, issues: 0, isGap: false });
    expect(data[1]).toEqual({ periodStart: '2024-02-01', axisLabel: 'Feb 2024', fullLabel: 'February 2024', title: 'February 2024', untagged: 0, tagged: 0, total: 0, rate: 0, issues: 0, isGap: true });
    // Real point's title equals backend Label, gap's title equals derived full label
    expect(data[0].title).toBe('Jan 2024');
    expect(data[1].title).toBe('February 2024');
  });

  it('toFeedRateData exposes rate:<feed> keys with null where a feed has no point', () => {
    const rows = buildPeriodRows(makeReportFixture());
    const data = toFeedRateData(rows, ['MT940', 'Ledger']);
    expect(rateDataKey('MT940')).toBe('rate:MT940');
    expect(data[1]['rate:MT940']).toBe(50);
    expect(data[1]['rate:Ledger']).toBeNull();
    expect(data[1].feeds).toEqual({ MT940: { rate: 50, count: 2000 }, Ledger: null });
    expect(data[0].feeds.Ledger).toEqual({ rate: 10, count: 100 });
    // Real point's title equals backend Label
    expect(data[1].title).toBe('Feb 2024');
  });

  it('point with empty Label yields backendLabel: null and title equal to derived full label', () => {
    const report: TaggingProgressReport = {
      ...makeReportFixture(),
      Series: [{ DataSetType: 'MT940', Points: [point('2024-01-01', '2024-01-31', '', 10, 5)], Totals: metrics() }],
    };
    const rows = buildPeriodRows(report);
    expect(rows[0].backendLabel).toBeNull();
    const data = toCoverageData(rows);
    expect(data[0].title).toBe('January 2024');
    expect(data[0].title).toBe(data[0].fullLabel);
  });

  it('isDenseAxis trips above the threshold', () => {
    expect(DENSE_AXIS_THRESHOLD).toBe(400);
    const rows = buildPeriodRows(makeReportFixture());
    expect(isDenseAxis(rows)).toBe(false);
    const many = Array.from({ length: 401 }, () => rows[0]);
    expect(isDenseAxis(many)).toBe(true);
  });
});
