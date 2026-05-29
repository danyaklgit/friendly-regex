import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useUserMode } from '../../context/UserModeContext';
import { getDemoCompanies } from '../../utils/userMode/getDemoCompanies';
import { BrandLogo } from '../shared/BrandLogo';
import { SunIcon, MoonIcon } from '../shared/ThemeIcons';

/**
 * Landing screen for user-mode. Lists the demo companies derived from the
 * `DEMO_USER_COMPS` LOV. Clicking a card persists the selection on
 * UserModeContext and hands off to the transactions page.
 *
 * Loading / empty states fall through to friendly copy — the user can't go
 * anywhere else from here, so we have to communicate clearly.
 */
export function CompanyPicker() {
  const { displayName, username, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { lovLists, lovLoading } = useLovAttributes();
  const { setSelectedCompany } = useUserMode();

  const companies = useMemo(() => getDemoCompanies(lovLists), [lovLists]);

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
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold text-heading">Choose a company</h1>
            <p className="text-sm text-body-secondary mt-1">
              Select the company whose transactions you'd like to review.
            </p>
          </div>

          {lovLoading ? (
            <CenteredSpinner />
          ) : companies.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {companies.map((c) => (
                <li key={c.value}>
                  <button
                    type="button"
                    onClick={() => setSelectedCompany(c)}
                    className="w-full text-left rounded-xl border border-border bg-surface p-4 transition-all hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <div className="text-sm font-medium text-heading">{c.name}</div>
                    <div className="mt-1 text-xs text-muted">
                      {c.ibans.length} account{c.ibans.length === 1 ? '' : 's'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" aria-label="Loading companies" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
      <p className="text-sm text-body">No companies are available for your account yet.</p>
      <p className="text-xs text-muted mt-1">Contact your administrator if you expected to see one here.</p>
    </div>
  );
}
