import type { LOVList } from '../../types/lov';

/** The shape the user-mode portal needs for each demo company. */
export interface DemoCompany {
  /** Stable value from the LOV item (used as React key, persisted choice). */
  value: string;
  /** Display name for the picker card. */
  name: string;
  /** IBANs that scope the transactions fetch for this company. */
  ibans: string[];
}

const DEMO_USER_COMPS_TAG = 'DEMO_USER_COMPS';

/**
 * Extract the list of demo companies from the LOV catalog. Companies without
 * any IBANs are filtered out — they'd produce an empty transactions page with
 * no way for the user to recover.
 *
 * Returns an empty array (not null) when the LOV is missing so callers can map
 * over it without a guard.
 */
export function getDemoCompanies(lovLists: LOVList[]): DemoCompany[] {
  const list = lovLists.find((l) => l.Tag === DEMO_USER_COMPS_TAG);
  if (!list) return [];
  return list.Items
    .map((item) => ({
      value: item.Value,
      name: item.Name,
      ibans: Array.isArray(item.Tags) ? item.Tags.filter((t): t is string => typeof t === 'string' && t.length > 0) : [],
    }))
    .filter((c) => c.ibans.length > 0);
}
