import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useUserMode, type BankSelection } from '../../context/UserModeContext';
import { getContextValue } from '../../types/tagSpec';
import { BrandLogo } from '../shared/BrandLogo';
import { Button } from '../shared/Button';
import { SunIcon, MoonIcon } from '../shared/ThemeIcons';

// Device-wide cache of the resolved bank list so revisiting the picker (even
// after a reload) shows banks instantly without waiting on — or depending on —
// GetTagSpecLibraries. Stale-while-revalidate: cached banks render immediately,
// and the freshly-computed list (when libraries + LOV resolve) replaces and
// re-persists them.
const BANK_CACHE_KEY = 'tep:userBankList';

function loadCachedBanks(): BankSelection[] {
  try {
    const raw = localStorage.getItem(BANK_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is BankSelection => !!b && typeof b.swift === 'string' && typeof b.name === 'string',
    );
  } catch {
    return [];
  }
}

function saveCachedBanks(banks: BankSelection[]): void {
  try {
    localStorage.setItem(BANK_CACHE_KEY, JSON.stringify(banks));
  } catch {
    console.warn('[BankPicker] failed to cache bank list');
  }
}

/**
 * Landing screen for user-mode. Multiselect of the **Saudi banks**: the
 * distinct `Context.BankSwiftCode` values present in the tag-spec libraries
 * (`GetTagSpecLibraries`), with names resolved from the `BANKS` LOV. Each bank
 * shows its name and a SWIFT monogram tile.
 *
 * We deliberately do NOT call `GetUserFilters` here — the picker is built
 * entirely from already-loaded data (libraries + LOV). `GetUserFilters` is
 * only called once the user has actually selected banks (the transactions
 * page's step-2 fetch, with `Banks`).
 *
 * Confirming the selection writes `{ swift, name }[]` to UserModeContext and
 * hands off to the transactions page, which scopes the fetch by `BankSwiftCode`
 * and (in PRO) requests the banks' attribute filters.
 */
export function BankPicker() {
  const { displayName, username, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { libraries, loading: tagSpecsLoading } = useTagSpecs();
  const { lovLookup, lovLoading } = useLovAttributes();
  const { setSelectedBanks } = useUserMode();

  const computed = useMemo<BankSelection[]>(() => {
    const bankNames = lovLookup.get('BANKS');
    const seen = new Set<string>();
    const out: BankSelection[] = [];
    for (const lib of libraries) {
      const swift = getContextValue(lib.Context, 'BankSwiftCode')?.trim();
      if (!swift) continue;
      const key = swift.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ swift, name: bankNames?.get(swift) ?? bankNames?.get(key) ?? swift });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [libraries, lovLookup]);

  // Persist the fresh list whenever we have one; render the cached list until
  // then (and as a fallback if the source data never loads this visit).
  useEffect(() => {
    if (computed.length > 0) saveCachedBanks(computed);
  }, [computed]);
  const cachedBanks = useMemo(() => loadCachedBanks(), []);
  const banks = computed.length > 0 ? computed : cachedBanks;

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

          {(tagSpecsLoading || lovLoading) && banks.length === 0 ? (
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
