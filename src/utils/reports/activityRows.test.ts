import { describe, it, expect } from 'vitest';
import { activityAxisBounds, buildActivityRows, historyNotice, toActivityData } from './activityRows';
import { makeActivityFixture, activityPoint } from './fixtures';
import { ZERO_ACTIVITY } from '../../api/taggingActivity';

describe('activityAxisBounds', () => {
  it('is null without points', () => {
    expect(activityAxisBounds({ ...makeActivityFixture(), Points: [] }, {})).toBeNull();
  });

  it('spans the first to the last point when nothing narrows or extends it', () => {
    expect(activityAxisBounds(makeActivityFixture(), {})).toEqual({ start: '2026-05-01', end: '2026-09-01' });
  });

  it('clamps a requested start before HistoryStartsAt to the history period', () => {
    expect(activityAxisBounds(makeActivityFixture(), { from: '2026-01-01' })).toEqual({ start: '2026-05-01', end: '2026-09-01' });
  });

  it('starts at the requested period when it is after the history start, even before the first point', () => {
    const report = { ...makeActivityFixture(), Points: makeActivityFixture().Points.slice(2) }; // Aug, Sep only
    expect(activityAxisBounds(report, { from: '2026-07-15' })).toEqual({ start: '2026-07-01', end: '2026-09-01' });
  });

  it('starts at the history period when no start is requested and history begins before the first point', () => {
    const report = { ...makeActivityFixture(), Points: makeActivityFixture().Points.slice(2) }; // Aug, Sep only; HistoryStartsAt 2026-05-27
    expect(activityAxisBounds(report, {})).toEqual({ start: '2026-05-01', end: '2026-09-01' });
  });

  it('never starts after the first real point', () => {
    expect(activityAxisBounds(makeActivityFixture(), { from: '2026-08-01' })).toEqual({ start: '2026-05-01', end: '2026-09-01' });
  });

  it('extends the end to the requested period', () => {
    expect(activityAxisBounds(makeActivityFixture(), { to: '2026-11-30' })).toEqual({ start: '2026-05-01', end: '2026-11-01' });
    expect(activityAxisBounds(makeActivityFixture(), { to: '2026-06-30' })).toEqual({ start: '2026-05-01', end: '2026-09-01' });
  });

  it('ignores unparseable dates', () => {
    expect(activityAxisBounds({ ...makeActivityFixture(), HistoryStartsAt: 'soon' }, { from: 'never' })).toEqual({ start: '2026-05-01', end: '2026-09-01' });
  });
});

describe('buildActivityRows', () => {
  it('zero-fills the quiet month and keeps real points', () => {
    const rows = buildActivityRows(makeActivityFixture(), {});
    expect(rows.map((r) => r.periodStart)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']);
    const july = rows[2];
    expect(july.isGap).toBe(true);
    expect(july.metrics).toEqual(ZERO_ACTIVITY);
    expect(july.backendLabel).toBeNull();
    expect(july.periodEnd).toBe('2026-07-31');
    expect(july.fullLabel).toBe('July 2026');
    const aug = rows[3];
    expect(aug.isGap).toBe(false);
    expect(aug.metrics.CheckIns).toBe(88);
    expect(aug.backendLabel).toBe('2026-08');
    expect(aug.axisLabel).toBe('Aug 2026');
  });

  it('zero-fills up to the requested end', () => {
    const rows = buildActivityRows(makeActivityFixture(), { to: '2026-11-30' });
    expect(rows.map((r) => r.periodStart)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']);
    expect(rows[6].isGap).toBe(true);
  });

  it('keeps the last point on a repeated PeriodStart', () => {
    const report = { ...makeActivityFixture(), HistoryStartsAt: '2026-08-01', Points: [activityPoint('2026-08-01', '2026-08-31', '2026-08', { CheckIns: 1 }), activityPoint('2026-08-01', '2026-08-31', '2026-08 (restated)', { CheckIns: 9 })] };
    const rows = buildActivityRows(report, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].metrics.CheckIns).toBe(9);
    expect(rows[0].backendLabel).toBe('2026-08 (restated)');
  });

  it('returns no rows without points', () => {
    expect(buildActivityRows({ ...makeActivityFixture(), Points: [] }, { from: '2026-01-01' })).toEqual([]);
  });
});

describe('historyNotice', () => {
  it('appears when the requested start is absent or earlier than the history start', () => {
    expect(historyNotice(undefined, '2026-05-27')).toBe('Activity records begin 2026-05-27. Earlier periods have no records and are not shown.');
    expect(historyNotice('2026-01-01', '2026-05-27')).toContain('begin 2026-05-27');
  });

  it('is null when the range starts inside the history or the history start is unknown', () => {
    expect(historyNotice('2026-06-01', '2026-05-27')).toBeNull();
    expect(historyNotice('2026-05-27', '2026-05-27')).toBeNull();
    expect(historyNotice('2026-01-01', '')).toBeNull();
  });
});

describe('toActivityData', () => {
  it('flattens rows for both activity charts', () => {
    const data = toActivityData(buildActivityRows(makeActivityFixture(), {}));
    expect(data[3]).toEqual({
      periodStart: '2026-08-01', axisLabel: 'Aug 2026', fullLabel: 'August 2026',
      checkIns: 88, rulesAdded: 115, saves: 12, rollbacks: 2, operators: 5, workspaces: 22, transactionsTagged: 50560, isGap: false,
    });
    expect(data[2].checkIns).toBe(0);
    expect(data[2].isGap).toBe(true);
  });
});
