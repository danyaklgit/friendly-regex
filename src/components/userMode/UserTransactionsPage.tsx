import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useUserMode } from '../../context/UserModeContext';
import { useTransactionData } from '../../hooks/useTransactionData';
import type { FilterProperty, FilterDefinition } from '../../api/transactions';
import { translateFilters } from '../../utils/translateFilters';
import { BrandLogo } from '../shared/BrandLogo';
import { Button } from '../shared/Button';
import { Toggle } from '../shared/Toggle';
import { SunIcon, MoonIcon } from '../shared/ThemeIcons';
import { DynamicFilters } from '../transactions/DynamicFilters';
import { ChangeBanksButton } from './ChangeBanksButton';
import { RedactionToggle } from './RedactionToggle';
import { UserTransactionTable } from './UserTransactionTable';
import { RedactedText } from './RedactedText';
import { MyContributionsModal } from './MyContributionsModal';
import { isHiddenGroupName } from '../../utils/userMode/groupsForTag';
import { useState } from 'react';

const BATCH_SIZE = 50;

/** Stable empty filter map so effects don't churn when PRO mode is off. */
const EMPTY_FILTERS: Record<string, Set<string>> = {};

/**
 * The user-mode transactions surface. Lives behind the company picker — once a
 * company is selected, this page renders the transactions filtered to its
 * IBANs.
 *
 * The IBAN filter is injected as a hidden `extraFilter` on every fetch — the
 * user cannot see, edit, or clear it. From their perspective, picking a
 * company IS the filter.
 *
 * Layout: a vertical flex column owns the full viewport. The header and the
 * toolbar take their natural height, the table container claims the remaining
 * space and scrolls internally (with a sticky `<thead>` so the column labels
 * stay pinned), and the forward-pagination strip sits at the bottom of the
 * main region so it stays visible alongside the table while the user works.
 *
 * Pagination is forward-only: the legacy negative `[−500] … [−25]` rewind
 * buttons proved confusing in user-testing — operators never wanted to "shrink"
 * the loaded buffer, only grow it — so we shipped a leaner one-direction strip
 * for the demo audience.
 */
export function UserTransactionsPage() {
  const { displayName, username, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { selectedBanks, proMode, setProMode } = useUserMode();
  const {
    fetchPage, loading, hasMore, transactions, totalTransactionsCount, fieldMeta, isLiveMode,
    fetchFilterDefinitions,
    userFilterDefinitions, userFilterDefinitionsLoading, fetchUserFilterDefinitions,
  } = useTransactionData();

  // Stable join of the selected SWIFT codes — the scope key for every
  // bank-derived memo/effect below.
  const swiftCodes = useMemo(() => selectedBanks.map((b) => b.swift), [selectedBanks]);
  const swiftKey = swiftCodes.join('|');

  // Operator GetFilters still feeds the table's TransactionTypeCode friendly
  // labels (e.g. TRF → "Transfer"). The filter bar is fed separately by
  // GetUserFilters below; keeping the two sources distinct means the table's
  // label lookup is unaffected by the user-mode filter set.
  useEffect(() => {
    void fetchFilterDefinitions();
  }, [fetchFilterDefinitions]);

  // Step 2 of the bank flow: GetUserFilters narrowed to the selected banks
  // returns the ATTR:* attribute filters (union of their values). Only needed
  // when PRO surfaces the filter bar. Re-fetched when the bank selection
  // changes.
  //
  // We intentionally do NOT probe AMOUNT's true max here (the operator path's
  // fetchDecimalMaxValues): each probe is its own GetTEPTransactions call,
  // and in user mode those add up to visible request spam on load. The slider
  // falls back to its 200M default instead.
  useEffect(() => {
    if (proMode && swiftCodes.length > 0) void fetchUserFilterDefinitions(swiftCodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proMode, swiftKey, fetchUserFilterDefinitions]);

  const [contributionsOpen, setContributionsOpen] = useState(false);

  // User-selected filter state (mirrors the operator `Record<Tag, Set<value>>`
  // shape so `translateFilters` inside `fetchPage` handles it identically).
  const [userFilters, setUserFilters] = useState<Record<string, Set<string>>>({});

  // Clear the bar whenever the bank selection changes — each selection starts
  // as a clean view (consistent with redaction re-arming on switch).
  useEffect(() => {
    setUserFilters({});
  }, [swiftKey]);

  // Hidden scope: a BankSwiftCode IN filter holding all selected banks, joined
  // with `|`. No Side filter — the bank context doesn't carry a side. The user
  // can't see, edit, or clear this; picking banks IS the scope.
  const bankFilter = useMemo<FilterProperty[]>(() => {
    if (swiftCodes.length === 0) return [];
    return [{ ColumnName: 'BankSwiftCode', Value: swiftCodes.join('|'), Operand: 'IN' }];
  }, [swiftCodes]);

  // Drop BANKS + ACCOUNTS from the bar — bank selection IS the scope (the
  // hidden `bankFilter` floor), so an in-bar selector would be redundant. Strip
  // the always-hidden Inflows / Outflows from GROUP_TAGS (they only restate the
  // debit/credit side). ATTR:* attribute filters pass through to render in the
  // bar's Attributes group.
  const scopedUserFilterDefinitions = useMemo<FilterDefinition[]>(
    () =>
      userFilterDefinitions
        .filter((def) => def.Tag !== 'ACCOUNTS' && def.Tag !== 'BANKS')
        .map((def) =>
          def.Tag === 'GROUP_TAGS'
            ? { ...def, Values: def.Values.filter((v) => !isHiddenGroupName(v.Label ?? '')) }
            : def,
        ),
    [userFilterDefinitions],
  );

  // Filters only apply while PRO mode exposes the bar — when it's off, the
  // hidden user-selected filters are ignored so a stale selection can't quietly
  // narrow the simplified view.
  const effectiveFilters = proMode ? userFilters : EMPTY_FILTERS;

  // Translate the user-selected filters HERE, against the user filter
  // definitions (GetUserFilters), and ship them as extra filtering properties
  // alongside the hidden bank floor. `fetchPage`'s own `translateFilters` runs
  // against the OPERATOR definitions (GetFilters), which don't carry the user's
  // ATTR:* / GetUserFilters tags — so translating in-page is the only way those
  // selections (e.g. OpsAttributes:BeneficiaryName) reach GetTEPTransactions.
  // We therefore pass `{}` as the filters arg and put everything in extraFilters.
  const extraFilters = useMemo<FilterProperty[]>(
    () => [...bankFilter, ...translateFilters(effectiveFilters, userFilterDefinitions)],
    [bankFilter, effectiveFilters, userFilterDefinitions],
  );

  // Serialize the request's filter CONTENT. The fetch effect keys off this so
  // it fires only when the actual filters change — not when `extraFilters` /
  // `fetchPage` merely churn identity (e.g. when userFilterDefinitions reloads,
  // tepConfig recreates, or the token rotates). Without this, those identity
  // changes each triggered a redundant GetTEPTransactions on load.
  const requestKey = useMemo(() => JSON.stringify(extraFilters), [extraFilters]);

  // Refs let the effect/loadMore read the latest fetcher + filters without
  // listing their (churning) identities as dependencies.
  const fetchPageRef = useRef(fetchPage);
  const extraFiltersRef = useRef(extraFilters);
  useEffect(() => { fetchPageRef.current = fetchPage; }, [fetchPage]);
  useEffect(() => { extraFiltersRef.current = extraFilters; }, [extraFilters]);

  // Initial fetch + react to a real filter/bank change (by content key).
  // Debounced so a bank-switch double-trigger coalesces into one request.
  // `append=false` replaces the buffer; omitting `pageIndex` uses the cursor.
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchPageRef.current(EMPTY_FILTERS, false, undefined, BATCH_SIZE, extraFiltersRef.current);
    }, 50);
    return () => clearTimeout(timer);
  }, [requestKey]);

  // Append the next batch onto the buffer. `append=true` plus a fresh fetch
  // each click is what makes the loaded count grow. Carries the active filters.
  const loadMore = useCallback(
    (size: number) => {
      // We can only ask for whole pages — the backend returns BATCH_SIZE at a
      // time. Issue ceil(size / BATCH_SIZE) fetches sequentially so the count
      // grows by ~size rows.
      const pages = Math.max(1, Math.ceil(size / BATCH_SIZE));
      void (async () => {
        for (let i = 0; i < pages; i++) {
          const rows = await fetchPageRef.current(EMPTY_FILTERS, true, undefined, BATCH_SIZE, extraFiltersRef.current);
          if (rows.length === 0) break;
        }
      })();
    },
    [],
  );

  const loaded = transactions.length;
  const total = totalTransactionsCount ?? loaded;
  const remaining = Math.max(0, total - loaded);

  // Forward-only batches from the canonical [25, 50, 200, 500] list, filtered
  // to what's actually possible right now (don't offer +500 if only 12 rows
  // remain — push a single "all remaining" button instead so the operator can
  // still get to the end in one click).
  const fwdBatches = (() => {
    const b = [25, 50, 200, 500].filter((x) => x <= remaining);
    if (b.length === 0 && remaining > 0) b.push(remaining);
    return b;
  })();

  // Hide the strip entirely on a real empty result. A populated table always
  // shows the count + buttons (even when nothing else is paginatable) so the
  // user always knows where they are.
  const showStrip = !(loaded === 0 && !loading);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface">
        <div className="flex items-center gap-4">
          <BrandLogo className="h-7" />
          {selectedBanks.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 pl-4 border-l border-border">
              <span className="text-xs text-muted">{selectedBanks.length === 1 ? 'Bank' : 'Banks'}</span>
              <span className="text-sm font-medium text-heading max-w-md truncate" title={selectedBanks.map((b) => b.name).join(', ')}>
                {selectedBanks.length <= 2
                  ? selectedBanks.map((b) => b.name).join(', ')
                  : `${selectedBanks[0].name} +${selectedBanks.length - 1} more`}
              </span>
              <ChangeBanksButton />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-body-secondary">{displayName ?? username}</span>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-md hover:bg-surface-hover text-body-secondary"
            aria-label="Toggle theme"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            onClick={logout}
            className="text-xs text-body-secondary hover:text-heading underline-offset-2 hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 px-6 py-4 gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <RedactionToggle />
            <ColorLegend proMode={proMode} />
          </div>
          <div className="flex items-center gap-3">
            <Toggle label="PRO" checked={proMode} onChange={setProMode} />
            {proMode && (
              <button
                type="button"
                onClick={() => setContributionsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary-dark hover:bg-primary/10 dark:text-primary-light dark:hover:bg-primary/15"
              >
                My Contributions
              </button>
            )}
          </div>
        </div>

        {proMode && (
          <DynamicFilters
            fieldMeta={fieldMeta}
            filters={userFilters}
            onFiltersChange={setUserFilters}
            isLiveMode={isLiveMode}
            filterDefinitions={scopedUserFilterDefinitions}
            filterDefinitionsLoading={userFilterDefinitionsLoading}
            renderValue={(text) => <RedactedText text={text} />}
          />
        )}

        <div className="flex-1 min-h-0">
          <UserTransactionTable rows={transactions} loading={loading} />
        </div>

        {showStrip && (
          <div className="flex items-center justify-center gap-3 py-2 border border-border bg-surface-secondary rounded-lg">
            {loading ? (
              <div className="flex items-center gap-3 animate-pulse">
                <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            ) : (
              <>
                <span className="text-xs text-muted">
                  <span className="font-medium text-heading">{loaded.toLocaleString()}</span>
                  {' loaded · '}
                  <span className="font-medium text-heading">{total.toLocaleString()}</span>
                  {' total'}
                </span>
                {hasMore && fwdBatches.length > 0 && (
                  <>
                    <span className="text-border">|</span>
                    {fwdBatches.map((size) => (
                      <Button
                        key={`fwd-${size}`}
                        variant="outline"
                        size="xs"
                        onClick={() => loadMore(size)}
                      >
                        +{size.toLocaleString()}
                      </Button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <MyContributionsModal open={contributionsOpen} onClose={() => setContributionsOpen(false)} />
    </div>
  );
}

/**
 * The three-tier color key that runs alongside the redaction toggle. Mirrors
 * the operator portal's legend so the demo audience reads cells the same way
 * we do internally — gray = raw bank values, blue = backend-enhanced (tags,
 * groups, attributes), orange = the user's own overrides.
 */
function ColorLegend({ proMode }: { proMode: boolean }) {
  return (
    <div className="hidden md:flex items-center gap-5 text-[11px] text-muted">
      <span className="flex items-center gap-1">
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-border-strong text-[8px] font-semibold text-faint">i</span>
        Data as provided by the bank(s)
      </span>
      {/* The blue/orange tiers only colour PRO-only columns (tags, groups,
          attributes), so their legend entries are hidden when PRO is off. */}
      {proMode && (
        <>
          <span className="flex items-center gap-1 text-primary">
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-primary text-[8px] font-semibold text-primary">i</span>
            Data as enhanced by BwaTech
          </span>
          <span className="flex items-center gap-1 text-orange-500">
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-orange-400 text-[8px] font-semibold text-orange-500">i</span>
            Data as customized by the user
          </span>
        </>
      )}
    </div>
  );
}
