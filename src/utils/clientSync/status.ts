import type {
  AccountState, ClientSyncInSummary, ClientSyncKbSummaryStats, ClientSyncLayer, ClientSyncOutSummaryStats, ClientSyncShow,
  ClientSyncTaggingSummary, KbStatus, KeyCount, OutStatus, WarningLevel,
} from '../../api/clientSync';
import type { CertaintyLevelTag } from '../../types';

/**
 * Every badge mapping of spec section 7 in one place. Components translate a
 * StatusTone into Badge props; nothing here knows about colors.
 */

export type StatusTone = 'success' | 'successStrong' | 'warning' | 'danger' | 'info' | 'gray' | 'grayOutline' | 'dash';
export interface StatusDisplay { label: string; tone: StatusTone }
export type HealthTone = 'success' | 'warning' | 'danger';
export interface CardHealth { tone: HealthTone; label: string }

export function kbStatusDisplay(status: KbStatus, context: 'list' | 'drawer'): StatusDisplay {
  switch (status) {
    case 'Promoted': return { label: 'Promoted', tone: 'success' };
    case 'NotKnown': return { label: 'Not known', tone: 'gray' };
    case 'Pending': return { label: 'Pending', tone: 'warning' };
    case 'NotEligible': return context === 'list' ? { label: '', tone: 'dash' } : { label: 'Not eligible', tone: 'grayOutline' };
  }
}

/** Both certainty vocabularies rank identically because the rank comes from the backend. */
export function certaintyTone(rank: number): StatusTone {
  switch (rank) {
    case 5: return 'successStrong';
    case 4: return 'success';
    case 3: return 'info';
    case 2: return 'warning';
    case 1: return 'danger';
    default: return 'gray';
  }
}

export function outStatusDisplay(status: OutStatus): StatusDisplay {
  switch (status) {
    case 'SENT': return { label: 'Sent', tone: 'success' };
    case 'UPDATED': return { label: 'Sent + patched', tone: 'success' };
    case 'FAILED': return { label: 'Failed', tone: 'danger' };
    case 'NOT_SENT': return { label: 'Not sent', tone: 'danger' };
    case 'NOT_SENT_BY_DESIGN': return { label: 'Not sent (late arrival)', tone: 'gray' };
    case 'DELETED': return { label: 'Deleted at BwaTech', tone: 'gray' };
    case 'UNTRACKED': return { label: 'No record', tone: 'grayOutline' };
    case 'NEVER': return { label: '', tone: 'dash' };
  }
}

export function accountStateDisplay(state: AccountState): StatusDisplay {
  switch (state) {
    case 'OK': return { label: 'OK', tone: 'success' };
    case 'ATTENTION': return { label: 'Attention', tone: 'warning' };
    case 'IDLE': return { label: 'No delivery', tone: 'gray' };
  }
}

export function warningTone(level: WarningLevel): 'warning' | 'info' {
  return level === 'WARNING' ? 'warning' : 'info';
}

export function feedChipLabel(dataSetType: string): string {
  return dataSetType === 'INTERIM_TransactionsList' ? 'INTERIM TL' : dataSetType;
}

/** TagBadge only knows HIGH / MEDIUM / LOW; anything else reads as HIGH. */
export function tagCertainty(level: string | null): CertaintyLevelTag {
  const upper = (level ?? '').toUpperCase();
  return upper === 'MEDIUM' || upper === 'LOW' ? upper : 'HIGH';
}

export const SHOW_LABELS: Record<ClientSyncShow, string> = {
  ALL: 'All', UNTAGGED: 'Untagged', LAYERS_DIFFER: 'Layers differ', KB_PROMOTED: 'KB promoted',
  KB_NOT_KNOWN: 'KB not known', KB_PENDING: 'KB pending', OUT_FAILED: 'Out failed', NOT_SENT: 'Not sent',
};
export const LAYER_LABELS: Record<ClientSyncLayer, string> = { ALL: 'All', INTRADAY: 'Intraday', CONFIRMED: 'Confirmed' };
export const LAYER_TITLES: Record<ClientSyncLayer, string> = {
  ALL: 'Every feed: confirmed statements and intraday reports',
  INTRADAY: 'MT942, INTERIM_MT940 and INTERIM_TransactionsList',
  CONFIRMED: 'MT940 and the end-of-day transaction lists',
};

export function showCount(counts: readonly KeyCount[], show: ClientSyncShow): number | null {
  const hit = counts.find((c) => c.Key === show);
  return hit ? hit.Count : null;
}

export function taggedPercent(tagged: number, transactions: number): number {
  return transactions > 0 ? Math.round((tagged / transactions) * 100) : 0;
}

export function inHealth(i: ClientSyncInSummary): CardHealth {
  return i.Rejected > 0 ? { tone: 'danger', label: 'Rejections' } : { tone: 'success', label: 'OK' };
}
export function taggingHealth(t: ClientSyncTaggingSummary): CardHealth {
  return t.Untagged > 0 ? { tone: 'warning', label: 'Untagged rows' } : { tone: 'success', label: 'All tagged' };
}
export function kbHealth(k: ClientSyncKbSummaryStats): CardHealth {
  return k.FailedCalls > 0 || k.Pending > 0 ? { tone: 'warning', label: 'Attention' } : { tone: 'success', label: 'OK' };
}
export function outHealth(o: ClientSyncOutSummaryStats): CardHealth {
  return o.RowsLastCallFailed > 0 || o.RowsNotSent > 0 ? { tone: 'danger', label: 'Failures' } : { tone: 'success', label: 'OK' };
}
