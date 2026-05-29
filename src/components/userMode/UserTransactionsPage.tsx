import { useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useUserMode } from '../../context/UserModeContext';
import { useTransactionData } from '../../hooks/useTransactionData';
import type { FilterProperty } from '../../api/transactions';
import { BrandLogo } from '../shared/BrandLogo';
import { Button } from '../shared/Button';
import { SunIcon, MoonIcon } from '../shared/ThemeIcons';
import { ChangeCompanyButton } from './ChangeCompanyButton';
import { RedactionToggle } from './RedactionToggle';
import { UserTransactionTable } from './UserTransactionTable';
import { MyContributionsModal } from './MyContributionsModal';
import { useState } from 'react';

const BATCH_SIZE = 50;

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
  const { selectedCompany } = useUserMode();
  const { fetchPage, loading, hasMore, transactions, totalTransactionsCount, fetchFilterDefinitions } = useTransactionData();

  // Filter definitions carry the user-friendly TransactionTypeCode labels
  // (e.g. TRF → "Transfer"). Fetched once at portal entry; the table cell
  // reads them via the same context to render code + description in one cell.
  useEffect(() => {
    void fetchFilterDefinitions();
  }, [fetchFilterDefinitions]);

  const [contributionsOpen, setContributionsOpen] = useState(false);

  const ibanFilter = useMemo<FilterProperty[]>(() => {
    if (!selectedCompany || selectedCompany.ibans.length === 0) return [];
    return [{ ColumnName: 'IBAN', Value: selectedCompany.ibans.join('|'), Operand: 'IN' }];
  }, [selectedCompany]);

  // Initial fetch + react to company swap. We pass empty UI filters — the
  // user-mode portal doesn't expose a filter panel. `append=false` replaces
  // the buffer so a company swap doesn't keep the previous company's rows.
  // Omitting `pageIndex` lets the underlying context fall back to the
  // incremental cursor (loadedCount / pageSize), matching the operator path.
  useEffect(() => {
    void fetchPage({}, false, undefined, BATCH_SIZE, ibanFilter);
  }, [fetchPage, ibanFilter]);

  // Append the next batch onto the buffer. `append=true` plus a fresh fetch
  // each click is what makes the loaded count grow.
  const loadMore = useCallback(
    (size: number) => {
      // We can only ask for whole pages — the backend returns BATCH_SIZE at a
      // time. Issue ceil(size / BATCH_SIZE) fetches sequentially so the count
      // grows by ~size rows.
      const pages = Math.max(1, Math.ceil(size / BATCH_SIZE));
      void (async () => {
        for (let i = 0; i < pages; i++) {
          const rows = await fetchPage({}, true, undefined, BATCH_SIZE, ibanFilter);
          if (rows.length === 0) break;
        }
      })();
    },
    [fetchPage, ibanFilter],
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
          {selectedCompany && (
            <div className="hidden sm:flex items-center gap-2 pl-4 border-l border-border">
              <span className="text-xs text-muted">Company</span>
              <span className="text-sm font-medium text-heading">{selectedCompany.name}</span>
              <ChangeCompanyButton />
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
            <ColorLegend />
          </div>
          <button
            type="button"
            onClick={() => setContributionsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary-dark hover:bg-primary/10 dark:text-primary-light dark:hover:bg-primary/15"
          >
            My Contributions
          </button>
        </div>

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
function ColorLegend() {
  return (
    <div className="hidden md:flex items-center gap-5 text-[11px] text-muted">
      <span className="flex items-center gap-1">
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-border-strong text-[8px] font-semibold text-faint">i</span>
        Data as provided by the bank(s)
      </span>
      <span className="flex items-center gap-1 text-primary">
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-primary text-[8px] font-semibold text-primary">i</span>
        {/* Enhanced data based on existing tag definitions */}
        Data as enhanced by BwaTech
      </span>
      <span className="flex items-center gap-1 text-orange-500">
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-orange-400 text-[8px] font-semibold text-orange-500">i</span>
        Data as customized by the user
      </span>
    </div>
  );
}
