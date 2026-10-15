import {
  isClientSyncLayer, type ClientSyncLayer, type ClientSyncScope, type ClientSyncShow, type ClientSyncTransactionsRequest,
} from '../../api/clientSync';
import { parseIsoDateUtc } from '../reports/periods';

/**
 * Client Sync scope controls (spec section 5): the persisted controls, their
 * validation, and the request builders. Dates are plain yyyy-MM-dd strings
 * compared as strings; day arithmetic goes through parseIsoDateUtc.
 */

export type ClientSyncMode = 'today' | 'range';
const MODES: readonly ClientSyncMode[] = ['today', 'range'];

export interface ClientSyncControls {
  /** '' = no client picked. */
  orgId: string;
  /** [] = all accounts of the client. */
  ibans: string[];
  mode: ClientSyncMode;
  /** Range mode only, yyyy-MM-dd or ''. */
  from: string;
  /** Range mode only, yyyy-MM-dd or ''. */
  to: string;
  layer: ClientSyncLayer;
  autoRefresh: boolean;
}

export const DEFAULT_CLIENT_SYNC_CONTROLS: ClientSyncControls = {
  orgId: '', ibans: [], mode: 'today', from: '', to: '', layer: 'ALL', autoRefresh: true,
};
export const CLIENT_SYNC_CONTROLS_STORAGE_KEY = 'tep:clientSync:controls';
/** Inclusive number of days a range may cover. */
export const MAX_RANGE_DAYS = 31;
export const RANGE_TOO_LONG_MESSAGE = 'Range can cover at most 31 days.';
export const RANGE_INVERTED_MESSAGE = 'From must be on or before To.';
export const AUTO_REFRESH_MS = 30000;
export const PAGE_SIZE_INITIAL = 100;
export const PAGE_SIZE_MAX = 2000;
export const LOAD_MORE_STEPS: readonly number[] = [50, 200];

const DAY_MS = 86400000;

/** A real calendar date in yyyy-MM-dd form; anything else is dropped so no request can 400. */
function isoOrEmpty(value: unknown): string {
  return typeof value === 'string' && parseIsoDateUtc(value) !== null ? value : '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

/** Whole days from `from` to `to` (0 for the same day); null when either is not a real date. */
export function daysBetween(from: string, to: string): number | null {
  const a = parseIsoDateUtc(from);
  const b = parseIsoDateUtc(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** True when `to` is more than 30 days after `from` (31 inclusive days is the cap). */
export function rangeTooLong(from: string, to: string): boolean {
  const days = daysBetween(from, to);
  return days !== null && days > MAX_RANGE_DAYS - 1;
}

/** True when both dates are real and differ: timestamps then carry their date. */
export function spansDays(from: string, to: string): boolean {
  const days = daysBetween(from, to);
  return days !== null && days !== 0;
}

/** Per-field validation of an untrusted object (localStorage). Never throws. */
export function sanitizeControls(raw: unknown): ClientSyncControls {
  const src = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  let from = isoOrEmpty(src.from);
  let to = isoOrEmpty(src.to);
  if (from && to && (from > to || rangeTooLong(from, to))) {
    from = '';
    to = '';
  }
  return {
    orgId: typeof src.orgId === 'string' ? src.orgId : DEFAULT_CLIENT_SYNC_CONTROLS.orgId,
    ibans: stringArray(src.ibans),
    mode: (MODES as readonly string[]).includes(src.mode as string) ? (src.mode as ClientSyncMode) : DEFAULT_CLIENT_SYNC_CONTROLS.mode,
    from,
    to,
    layer: isClientSyncLayer(src.layer) ? src.layer : DEFAULT_CLIENT_SYNC_CONTROLS.layer,
    autoRefresh: typeof src.autoRefresh === 'boolean' ? src.autoRefresh : DEFAULT_CLIENT_SYNC_CONTROLS.autoRefresh,
  };
}

export function readStoredControls(storage: Pick<Storage, 'getItem'> | null | undefined): ClientSyncControls {
  try {
    const raw = storage?.getItem(CLIENT_SYNC_CONTROLS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CLIENT_SYNC_CONTROLS };
    return sanitizeControls(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CLIENT_SYNC_CONTROLS };
  }
}

export function writeStoredControls(storage: Pick<Storage, 'setItem'> | null | undefined, controls: ClientSyncControls): void {
  try {
    storage?.setItem(CLIENT_SYNC_CONTROLS_STORAGE_KEY, JSON.stringify(controls));
  } catch {
    // Storage unavailable or full: the view simply won't persist.
  }
}

/** The dates a request carries: today in today mode; in range mode the stored dates, each blank one falling back to today. */
export function resolveRange(controls: ClientSyncControls, today: string): { from: string; to: string } {
  if (controls.mode === 'today') return { from: today, to: today };
  return { from: controls.from || today, to: controls.to || today };
}

/** The message that blocks the request, or null when the range can be sent. */
export function rangeError(controls: ClientSyncControls, today: string): string | null {
  const { from, to } = resolveRange(controls, today);
  if (from > to) return RANGE_INVERTED_MESSAGE;
  if (rangeTooLong(from, to)) return RANGE_TOO_LONG_MESSAGE;
  return null;
}

export function buildScope(controls: ClientSyncControls, today: string): ClientSyncScope {
  const { from, to } = resolveRange(controls, today);
  return {
    ...(controls.orgId ? { OrgId: controls.orgId } : {}),
    ...(controls.ibans.length > 0 ? { IBANs: [...controls.ibans] } : {}),
    FromDate: from,
    ToDate: to,
    Layer: controls.layer,
  };
}

/** Always page 1 with PageSize = the loaded window; load-more grows the window and re-keys the request. */
export function buildTransactionsRequest(scope: ClientSyncScope, show: ClientSyncShow, search: string, limit: number): ClientSyncTransactionsRequest {
  const trimmed = search.trim();
  return { ...scope, Show: show, ...(trimmed ? { Search: trimmed } : {}), PageIndex: 1, PageSize: limit };
}

export function nextLimit(limit: number, step: number): number {
  return Math.min(limit + step, PAGE_SIZE_MAX);
}
