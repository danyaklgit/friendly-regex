import { isGranularity, isLayer, type TaggingGranularity, type TaggingLayer } from '../../api/taggingReportsShared';
import type { TaggingProgressRequest } from '../../api/taggingProgress';
import type { TaggingActivityRequest } from '../../api/taggingActivity';
import { DATA_SET_TYPES } from '../../constants/dataSetTypes';
import { addDaysIso, parseIsoDateUtc } from './periods';

export type ReportPreset = 'last30' | 'last90' | 'thisYear' | 'all' | 'custom';
export const REPORT_PRESETS: readonly ReportPreset[] = ['last30', 'last90', 'thisYear', 'all', 'custom'];
export const PRESET_LABELS: Record<ReportPreset, string> = {
  last30: 'Last 30 days', last90: 'Last 90 days', thisYear: 'This year', all: 'All time', custom: 'Custom',
};

export type ReportView = 'coverage' | 'activity';
export const REPORT_VIEWS: readonly ReportView[] = ['coverage', 'activity'];
export const VIEW_LABELS: Record<ReportView, string> = { coverage: 'Coverage', activity: 'Team activity' };

export const REPORT_SIDES = ['CR', 'DR'] as const;
export const SIDE_LABELS: Record<string, string> = { CR: 'Credit', DR: 'Debit' };

export interface ReportControls {
  preset: ReportPreset;
  /** Custom preset only; '' = open start. */
  from: string;
  /** Custom preset only; '' = open end. */
  to: string;
  granularity: TaggingGranularity;
  /** [] = all. Coverage only. */
  dataSetTypes: string[];
  /** [] = all. Coverage only. */
  banks: string[];
  /** [] = all; 'CR' | 'DR'. Coverage only. */
  sides: string[];
  /** Coverage only; always sent explicitly. */
  layer: TaggingLayer;
  view: ReportView;
}

export const DEFAULT_REPORT_CONTROLS: ReportControls = {
  preset: 'all', from: '', to: '', granularity: 'Month', dataSetTypes: [], banks: [], sides: [], layer: 'Ops', view: 'coverage',
};

export const REPORT_CONTROLS_STORAGE_KEY = 'tep:reports:controls';

/** A real calendar date in yyyy-MM-dd form; anything else (wrong shape, 2026-02-30) is dropped so no request can 400. */
function isoOrEmpty(value: unknown): string {
  return typeof value === 'string' && parseIsoDateUtc(value) !== null ? value : '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

/** Per-field validation of an untrusted object (sessionStorage, a future share link). Never throws. */
export function sanitizeControls(raw: unknown): ReportControls {
  const src = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const preset = (REPORT_PRESETS as readonly string[]).includes(src.preset as string) ? (src.preset as ReportPreset) : DEFAULT_REPORT_CONTROLS.preset;
  let from = isoOrEmpty(src.from);
  let to = isoOrEmpty(src.to);
  if (from && to && from > to) { from = ''; to = ''; } // an inverted range would 400
  return {
    preset,
    from,
    to,
    granularity: isGranularity(src.granularity) ? src.granularity : DEFAULT_REPORT_CONTROLS.granularity,
    dataSetTypes: stringArray(src.dataSetTypes).filter((d) => (DATA_SET_TYPES as readonly string[]).includes(d)),
    banks: stringArray(src.banks),
    sides: stringArray(src.sides).filter((s) => (REPORT_SIDES as readonly string[]).includes(s)),
    layer: isLayer(src.layer) ? src.layer : DEFAULT_REPORT_CONTROLS.layer,
    view: (REPORT_VIEWS as readonly string[]).includes(src.view as string) ? (src.view as ReportView) : DEFAULT_REPORT_CONTROLS.view,
  };
}

export function readStoredControls(storage: Pick<Storage, 'getItem'> | null | undefined): ReportControls {
  try {
    const raw = storage?.getItem(REPORT_CONTROLS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_REPORT_CONTROLS };
    return sanitizeControls(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_REPORT_CONTROLS };
  }
}

export function writeStoredControls(storage: Pick<Storage, 'setItem'> | null | undefined, controls: ReportControls): void {
  try {
    storage?.setItem(REPORT_CONTROLS_STORAGE_KEY, JSON.stringify(controls));
  } catch {
    // Storage unavailable or full: the view simply won't persist.
  }
}

/** The browser's LOCAL calendar date. Presets are the one place local time is used (a UAE browser near midnight can be a day behind Saudi; accepted). */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function resolvePresetRange(controls: ReportControls, today: string): { from?: string; to?: string } {
  switch (controls.preset) {
    case 'last30':
      return { from: addDaysIso(today, -29), to: today };
    case 'last90':
      return { from: addDaysIso(today, -89), to: today };
    case 'thisYear':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'all':
      return {};
    case 'custom':
      return { ...(controls.from ? { from: controls.from } : {}), ...(controls.to ? { to: controls.to } : {}) };
  }
}

export function buildTaggingProgressRequest(controls: ReportControls, today: string): TaggingProgressRequest {
  const { from, to } = resolvePresetRange(controls, today);
  return {
    ...(from ? { FromDate: from } : {}),
    ...(to ? { ToDate: to } : {}),
    Granularity: controls.granularity,
    ...(controls.dataSetTypes.length > 0 ? { DataSetTypes: [...controls.dataSetTypes] } : {}),
    ...(controls.banks.length > 0 ? { BankSwiftCodes: [...controls.banks] } : {}),
    ...(controls.sides.length > 0 ? { Sides: [...controls.sides] } : {}),
    Layer: controls.layer,
  };
}

export function buildTaggingActivityRequest(controls: ReportControls, today: string): TaggingActivityRequest {
  const { from, to } = resolvePresetRange(controls, today);
  return {
    ...(from ? { FromDate: from } : {}),
    ...(to ? { ToDate: to } : {}),
    Granularity: controls.granularity,
  };
}
