import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REPORT_CONTROLS, REPORT_CONTROLS_STORAGE_KEY, sanitizeControls, readStoredControls, writeStoredControls,
  todayIso, resolvePresetRange, buildTaggingProgressRequest, buildTaggingActivityRequest, PRESET_LABELS, VIEW_LABELS,
  type ReportControls,
} from './controls';

const TODAY = '2026-09-28';

function controls(patch: Partial<ReportControls> = {}): ReportControls {
  return { ...DEFAULT_REPORT_CONTROLS, ...patch };
}

describe('defaults and labels', () => {
  it('starts on Coverage, all time, by month, operator view, no filters', () => {
    expect(DEFAULT_REPORT_CONTROLS).toEqual({ preset: 'all', from: '', to: '', granularity: 'Month', dataSetTypes: [], banks: [], sides: [], layer: 'Ops', view: 'coverage' });
    expect(PRESET_LABELS).toEqual({ last30: 'Last 30 days', last90: 'Last 90 days', thisYear: 'This year', all: 'All time', custom: 'Custom' });
    expect(VIEW_LABELS).toEqual({ coverage: 'Coverage', activity: 'Team activity' });
    expect(REPORT_CONTROLS_STORAGE_KEY).toBe('tep:reports:controls');
  });
});

describe('sanitizeControls', () => {
  it('keeps a valid object', () => {
    const valid = controls({ preset: 'custom', from: '2026-01-01', to: '2026-03-31', granularity: 'Week', dataSetTypes: ['MT940'], banks: ['SABBSARI'], sides: ['CR'], layer: 'Active', view: 'activity' });
    expect(sanitizeControls(valid)).toEqual(valid);
  });

  it('falls back per field on unknown values and wrong shapes', () => {
    expect(sanitizeControls({ preset: 'lastYear', granularity: 'Quarter', layer: 'ops', view: 'summary', dataSetTypes: 'MT940', banks: [1, 'X'], sides: ['CR', 'RC', 'DR'] }))
      .toEqual(controls({ banks: ['X'], sides: ['CR', 'DR'] }));
    expect(sanitizeControls(null)).toEqual(DEFAULT_REPORT_CONTROLS);
    expect(sanitizeControls('garbage')).toEqual(DEFAULT_REPORT_CONTROLS);
  });

  it('drops unknown dataSetTypes not in the known feed list', () => {
    expect(sanitizeControls(controls({ dataSetTypes: ['MT940', 'BOGUS'] }))).toEqual(controls({ dataSetTypes: ['MT940'] }));
  });

  it('drops an inverted or malformed custom range so no request can 400', () => {
    expect(sanitizeControls(controls({ preset: 'custom', from: '2026-03-01', to: '2026-01-01' }))).toEqual(controls({ preset: 'custom' }));
    expect(sanitizeControls(controls({ preset: 'custom', from: '01/03/2026', to: '2026-01-01' }))).toEqual(controls({ preset: 'custom', to: '2026-01-01' }));
    expect(sanitizeControls(controls({ preset: 'custom', from: '2026-02-30', to: '2026-03-01' }))).toEqual(controls({ preset: 'custom', to: '2026-03-01' }));
  });
});

describe('storage', () => {
  it('reads defaults for missing, corrupt, or throwing storage', () => {
    expect(readStoredControls(null)).toEqual(DEFAULT_REPORT_CONTROLS);
    expect(readStoredControls({ getItem: () => null })).toEqual(DEFAULT_REPORT_CONTROLS);
    expect(readStoredControls({ getItem: () => '{not json' })).toEqual(DEFAULT_REPORT_CONTROLS);
    expect(readStoredControls({ getItem: () => { throw new Error('blocked'); } })).toEqual(DEFAULT_REPORT_CONTROLS);
  });

  it('round-trips through a storage object and swallows write failures', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    writeStoredControls(storage, controls({ granularity: 'Year', view: 'activity' }));
    expect(readStoredControls(storage)).toEqual(controls({ granularity: 'Year', view: 'activity' }));
    expect(() => writeStoredControls({ setItem: () => { throw new Error('quota'); } }, DEFAULT_REPORT_CONTROLS)).not.toThrow();
  });
});

describe('todayIso', () => {
  it('uses the LOCAL calendar date, zero-padded', () => {
    expect(todayIso(new Date(2026, 8, 28, 23, 30))).toBe('2026-09-28');
    expect(todayIso(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });
});

describe('resolvePresetRange', () => {
  it.each([
    ['last30', { from: '2026-08-30', to: TODAY }],
    ['last90', { from: '2026-07-01', to: TODAY }],
    ['thisYear', { from: '2026-01-01', to: TODAY }],
    ['all', {}],
  ] as const)('%s', (preset, expected) => {
    expect(resolvePresetRange(controls({ preset }), TODAY)).toEqual(expected);
  });

  it('custom passes through only the set ends', () => {
    expect(resolvePresetRange(controls({ preset: 'custom', from: '2026-02-01', to: '' }), TODAY)).toEqual({ from: '2026-02-01' });
    expect(resolvePresetRange(controls({ preset: 'custom', from: '', to: '2026-02-01' }), TODAY)).toEqual({ to: '2026-02-01' });
    expect(resolvePresetRange(controls({ preset: 'custom' }), TODAY)).toEqual({});
  });
});

describe('request builders', () => {
  it('progress: always Granularity + Layer, dates from the preset, filters only when non-empty', () => {
    expect(buildTaggingProgressRequest(controls(), TODAY)).toEqual({ Granularity: 'Month', Layer: 'Ops' });
    expect(buildTaggingProgressRequest(controls({ preset: 'last30', granularity: 'Day', layer: 'Active', dataSetTypes: ['MT940', 'Ledger'], banks: ['SABBSARI'], sides: ['DR'] }), TODAY))
      .toEqual({ FromDate: '2026-08-30', ToDate: TODAY, Granularity: 'Day', Layer: 'Active', DataSetTypes: ['MT940', 'Ledger'], BankSwiftCodes: ['SABBSARI'], Sides: ['DR'] });
  });

  it('activity: only dates and Granularity; feed/bank/side/layer never leak', () => {
    expect(buildTaggingActivityRequest(controls({ dataSetTypes: ['MT940'], layer: 'Active' }), TODAY)).toEqual({ Granularity: 'Month' });
    expect(buildTaggingActivityRequest(controls({ preset: 'thisYear', granularity: 'Week' }), TODAY)).toEqual({ FromDate: '2026-01-01', ToDate: TODAY, Granularity: 'Week' });
  });
});
