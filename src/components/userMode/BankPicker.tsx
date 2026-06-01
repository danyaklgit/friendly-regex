import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useTransactionData } from '../../hooks/useTransactionData';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useUserMode, type BankSelection } from '../../context/UserModeContext';
import { getContextValue } from '../../types/tagSpec';
import { BrandLogo } from '../shared/BrandLogo';
import { Button } from '../shared/Button';
import { SunIcon, MoonIcon } from '../shared/ThemeIcons';

/**
 * Landing screen for user-mode. Multiselect of banks, sourced from the `BANKS`
 * filter returned by `GetUserFilters` (no `Banks` argument → all banks), then
 * narrowed to the **Saudi banks**: the distinct `Context.BankSwiftCode` values
 * present in the tag-spec libraries (`GetTagSpecLibraries`). Each bank shows
 * its name (BANKS filter value `Label`) and a SWIFT monogram tile.
 *
 * Confirming the selection writes `{ swift, name }[]` to UserModeContext and
 * hands off to the transactions page, which scopes the fetch by `BankSwiftCode`
 * and (in PRO) requests the banks' attribute filters.
 */
export function BankPicker() {
  const { displayName, username, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { userFilterDefinitions, userFilterDefinitionsLoading, fetchUserFilterDefinitions } = useTransactionData();
  const { libraries } = useTagSpecs();
  const { setSelectedBanks } = useUserMode();

  // Step 1: list all banks (no Banks arg).
  useEffect(() => {
    void fetchUserFilterDefinitions();
  }, [fetchUserFilterDefinitions]);

  // Saudi banks = the distinct BankSwiftCode values scoped by the tag-spec
  // libraries. Empty when GetTagSpecLibraries hasn't loaded (or 403s for the
  // demo `user` role), in which case we don't over-filter to nothing — see the
  // fallback in `banks` below.
  const saudiSwiftCodes = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const lib of libraries) {
      const code = getContextValue(lib.Context, 'BankSwiftCode')?.trim().toUpperCase();
      if (code) set.add(code);
    }
    return set;
  }, [libraries]);

  const banks = useMemo<BankSelection[]>(() => {
    const def = userFilterDefinitions.find((d) => d.Tag === 'BANKS');
    if (!def) return [];
    const seen = new Set<string>();
    const all: BankSelection[] = [];
    for (const v of def.Values) {
      const swift = (v.Value ?? '').trim();
      if (!swift || seen.has(swift)) continue;
      seen.add(swift);
      all.push({ swift, name: v.Label || swift });
    }
    // Narrow to Saudi banks when we have the library-derived set; otherwise
    // fall back to all banks rather than render an empty picker.
    const scoped = saudiSwiftCodes.size > 0
      ? all.filter((b) => saudiSwiftCodes.has(b.swift.toUpperCase()))
      : all;
    return scoped.sort((a, b) => a.name.localeCompare(b.name));
  }, [userFilterDefinitions, saudiSwiftCodes]);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (swift: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(swift)) next.delete(swift);
      else next.add(swift);
      return next;
    });
  };

  const confirm = () => {
    const chosen = banks.filter((b) => selected.has(b.swift));
    if (chosen.length > 0) setSelectedBanks(chosen);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
        <BrandLogo className="h-7" />
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

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-3xl">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-heading">Choose your bank(s)</h1>
            <p className="text-sm text-body-secondary mt-1">
              Select one or more banks whose transactions you'd like to review.
            </p>
          </div>

          {userFilterDefinitionsLoading && banks.length === 0 ? (
            <CenteredSpinner />
          ) : banks.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                {banks.map((b) => {
                  const checked = selected.has(b.swift);
                  return (
                    <li key={b.swift}>
                      <button
                        type="button"
                        onClick={() => toggle(b.swift)}
                        aria-pressed={checked}
                        className={`w-full text-left rounded-xl border p-4 transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 flex items-center gap-3 ${
                          checked
                            ? 'border-primary bg-primary/10 shadow-sm'
                            : 'border-border bg-surface hover:border-primary hover:shadow-md'
                        }`}
                      >
                        <BankMonogram swift={b.swift} name={b.name} />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-heading truncate">{b.name}</span>
                          <span className="block text-[11px] text-muted font-mono">{b.swift}</span>
                        </span>
                        {checked && (
                          <svg className="ml-auto w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="text-xs text-muted">
                  {selected.size > 0 ? `${selected.size} selected` : 'No banks selected yet'}
                </span>
                <Button variant="primary" onClick={confirm} disabled={selected.size === 0}>
                  View transactions
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/** SWIFT-keyed monogram fallback (no logo data). Two initials from the bank
 *  name on a tinted tile. */
function BankMonogram({ swift, name }: { swift: string; name: string }) {
  const initials = (name.match(/\b[A-Za-z]/g) ?? [swift[0] ?? '?']).slice(0, 2).join('').toUpperCase();
  return (
    <span
      className="grid place-items-center w-9 h-9 rounded-lg bg-primary/15 text-primary-dark dark:text-primary-light text-xs font-semibold shrink-0"
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" aria-label="Loading banks" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
      <p className="text-sm text-body">No banks are available for your account yet.</p>
      <p className="text-xs text-muted mt-1">Contact your administrator if you expected to see one here.</p>
    </div>
  );
}
