import { DATA_SET_TYPE_LABELS, type DataSetType } from '../../constants/dataSetTypes';

/**
 * Color follows the ENTITY, never its rank: a feed keeps its slot whatever
 * else is filtered out, so a reader who learned "MT940 is cyan" is never
 * misled. Slots are the validated --color-chart-N tokens (src/index.css).
 * A feed outside the five known types folds into the gray "Other" and keeps
 * its own named row in the per-feed table.
 */
export const FEED_SLOT: Readonly<Record<string, number>> = {
  MT940: 1,
  MT942: 2,
  INTERIM_MT940: 3,
  INTERIM_TransactionsList: 4,
  Ledger: 5,
};

export const OTHER_FEED_COLOR = 'var(--color-faint)';
export const TAGGED_COLOR = 'var(--color-chart-1)';
export const UNTAGGED_COLOR = 'var(--color-chart-2)';

export function feedSlot(dataSetType: string): number | null {
  return FEED_SLOT[dataSetType] ?? null;
}

export function feedColor(dataSetType: string): string {
  const slot = feedSlot(dataSetType);
  return slot === null ? OTHER_FEED_COLOR : `var(--color-chart-${slot})`;
}

export function feedLabel(dataSetType: string): string {
  return DATA_SET_TYPE_LABELS[dataSetType as DataSetType] ?? dataSetType;
}
