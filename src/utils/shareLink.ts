export interface ShareToggles {
  compactMode: boolean;
  incrementalPagination: boolean;
  showAttributes: boolean;
}

export interface ShareParams {
  bank: string;
  side: string;
  /** Workspace type. Absent on pre-intraday links → defaults to MT940. */
  dataSetType: string;
  /** Ledger identity — present only for Ledger share links. */
  clientCode?: string;
  erpCode?: string;
  filters: Record<string, Set<string>>;
  toggles?: ShareToggles;
  note?: string;
  sharedBy: string;
}

/**
 * Filter tags the backend retired for Ledger with the V2.1 filter set
 * (2026-08-20): Statement Date → POSTINGDATE, Bank Reference → EXTERNALREF,
 * IBAN removed, and the Party / Narrative / Reference searches merged into
 * the shared Search. A persisted share link may still carry selections under
 * the old tags — drop them on restore, the same posture parseSortOverride
 * takes for unknown sort fields. Range keys (`TAG_GTE` / `TAG_LTE`) match on
 * their base tag.
 */
const RETIRED_LEDGER_FILTER_TAGS = new Set([
  'STATEMENTDATE',
  'BANKREF',
  'IBAN',
  'PARTY',
  'NARRATIVE',
  'REFERENCE',
]);

/** Remove retired-for-Ledger filter tags from a restored filter state.
 *  No-op for statement workspaces (their tags are unchanged). */
export function pruneRetiredLedgerFilters(
  filters: Record<string, Set<string>>,
  dataSetType: string | undefined | null,
): Record<string, Set<string>> {
  if (dataSetType !== 'Ledger') return filters;
  const result: Record<string, Set<string>> = {};
  for (const [key, values] of Object.entries(filters)) {
    const base = key.replace(/_(?:GTE|LTE)$/, '');
    if (RETIRED_LEDGER_FILTER_TAGS.has(base)) continue;
    result[key] = values;
  }
  return result;
}

/** Serialize FilterState (Record<string, Set<string>>) to a URL-safe base64 string. */
export function serializeFilters(filters: Record<string, Set<string>>): string {
  const obj: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(filters)) {
    if (values.size > 0) obj[key] = [...values];
  }
  return btoa(JSON.stringify(obj));
}

/** Deserialize a base64 string back to Record<string, Set<string>>. */
export function deserializeFilters(encoded: string): Record<string, Set<string>> {
  const obj = JSON.parse(atob(encoded)) as Record<string, string[]>;
  const result: Record<string, Set<string>> = {};
  for (const [key, values] of Object.entries(obj)) {
    result[key] = new Set(values);
  }
  return result;
}

/** Build a full share URL from the current app state. */
export function buildShareUrl(params: {
  bank: string;
  side: string;
  dataSetType: string;
  clientCode?: string;
  erpCode?: string;
  filters: Record<string, Set<string>>;
  toggles?: ShareToggles;
  note?: string;
  sharedBy: string;
}): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('share', '1');
  url.searchParams.set('bank', params.bank);
  url.searchParams.set('side', params.side);
  url.searchParams.set('dst', params.dataSetType);
  if (params.clientCode) url.searchParams.set('client', params.clientCode);
  if (params.erpCode) url.searchParams.set('erp', params.erpCode);
  url.searchParams.set('filters', serializeFilters(params.filters));
  if (params.toggles) url.searchParams.set('toggles', btoa(JSON.stringify(params.toggles)));
  if (params.note) url.searchParams.set('note', params.note);
  url.searchParams.set('shared_by', params.sharedBy);
  return url.toString();
}

/** Parse share params from the current URL. Returns null if not a share link. */
export function parseShareParams(): ShareParams | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('share') !== '1') return null;
  const bank = params.get('bank') ?? '';
  const side = params.get('side') ?? '';
  const dataSetType = params.get('dst') || 'MT940';
  const clientCode = params.get('client') || undefined;
  const erpCode = params.get('erp') || undefined;
  const filtersRaw = params.get('filters');
  const sharedBy = params.get('shared_by');
  if (!filtersRaw || !sharedBy) return null;
  // Identity must be complete for the workspace: Ledger needs client+erp,
  // every other type needs bank+side.
  const ledger = dataSetType === 'Ledger';
  if (ledger ? !(clientCode && erpCode) : !(bank && side)) return null;
  try {
    const filters = deserializeFilters(filtersRaw);
    const note = params.get('note') || undefined;
    const togglesRaw = params.get('toggles');
    const toggles = togglesRaw ? JSON.parse(atob(togglesRaw)) as ShareToggles : undefined;
    return { bank, side, dataSetType, clientCode, erpCode, filters, toggles, note, sharedBy };
  } catch {
    return null;
  }
}

const SESSION_KEY = 'tep:shareParams';

/** Persist share params to sessionStorage (survives login render cycle). */
export function storeShareParams(params: ShareParams): void {
  const serializable = {
    ...params,
    filters: Object.fromEntries(
      Object.entries(params.filters).map(([k, v]) => [k, [...v]]),
    ),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(serializable));
}

/** Read and consume share params from sessionStorage. Returns null if none stored. */
export function consumeStoredShareParams(): ShareParams | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(SESSION_KEY);
  try {
    const obj = JSON.parse(raw) as { bank: string; side: string; dataSetType?: string; clientCode?: string; erpCode?: string; filters: Record<string, string[]>; toggles?: ShareToggles; note?: string; sharedBy: string };
    const filters: Record<string, Set<string>> = {};
    for (const [key, values] of Object.entries(obj.filters)) {
      filters[key] = new Set(values);
    }
    return { bank: obj.bank, side: obj.side, dataSetType: obj.dataSetType ?? 'MT940', clientCode: obj.clientCode, erpCode: obj.erpCode, filters, toggles: obj.toggles, note: obj.note, sharedBy: obj.sharedBy };
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

/** Remove share query params from the URL without triggering a page reload. */
export function clearShareParamsFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('share');
  url.searchParams.delete('bank');
  url.searchParams.delete('side');
  url.searchParams.delete('dst');
  url.searchParams.delete('client');
  url.searchParams.delete('erp');
  url.searchParams.delete('filters');
  url.searchParams.delete('toggles');
  url.searchParams.delete('note');
  url.searchParams.delete('shared_by');
  const clean = url.searchParams.toString() ? `${url.pathname}?${url.searchParams}` : url.pathname;
  window.history.replaceState({}, '', clean);
}
