import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useTimeRemaining } from '../../hooks/useTimeRemaining';
import { Tooltip } from '../shared/Tooltip';
import { Button } from '../shared/Button';

interface CheckoutInfo {
  bank: string;
  side: string;
  hasChanges: boolean;
  isReadOnly?: boolean;
  onRelease: (bank: string, side: string) => void;
  onCheckin: (bank: string, side: string) => void;
  onRequestUndo?: (bank: string, side: string) => void;
}

interface PageHeaderProps {
  tabs: { label: string }[];
  activeIndex: number;
  onTabChange: (index: number) => void;
  checkout?: CheckoutInfo;
  onOpenOnboarding?: () => void;
  onShare?: () => void;
}

export function PageHeader({ tabs, activeIndex, onTabChange, checkout, onOpenOnboarding, onShare }: PageHeaderProps) {
  const { logout, username, displayName, expiresAt } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const timeRemaining = useTimeRemaining(expiresAt);

  return (
    <header className="bg-surface border-b border-border">
      <div className="max-w-10xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-6 h-12">
        <h1 className="text-lg font-semibold text-heading shrink-0">Transactions Enrichment Program</h1>
        <nav className="flex gap-4 h-full" aria-label="Tabs">
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => onTabChange(i)}
              className={`text-sm font-medium border-b-2 transition-colors cursor-pointer h-full flex items-center
                ${
                  i === activeIndex
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-body hover:border-border-strong'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        {checkout && (
          <div data-tour="checkout-active-indicator" className="flex items-center gap-3 ml-auto">
            <span className="text-sm text-primary-dark">
              <span className="font-semibold">{checkout.isReadOnly ? "You're viewing" : "You're working on"}</span> {checkout.bank} - {checkout.side}
            </span>
            {!checkout.isReadOnly && (
              <>
                {checkout.onRequestUndo && checkout.hasChanges && (
                  <Button variant="secondary" size="xs" onClick={() => checkout.onRequestUndo!(checkout.bank, checkout.side)}>
                    Review Changes
                  </Button>
                )}
                <span data-tour="checkout-actions" className="flex items-center gap-2">
                  <Button variant="primary" size="xs" onClick={() => checkout.onRelease(checkout.bank, checkout.side)}>
                    {checkout.hasChanges ? 'Save and Release' : 'Release'}
                  </Button>
                  <Button variant="primary" size="xs" onClick={() => checkout.onCheckin(checkout.bank, checkout.side)}>
                    {checkout.hasChanges ? 'Save and Check In' : 'Check In'}
                  </Button>
                </span>
              </>
            )}
          </div>
        )}
        <div className={`${checkout ? '' : 'ml-auto '}flex items-center gap-3`}>
          <Tooltip content={timeRemaining} placement="bottom">
            <span className="text-xs text-body">{displayName ?? username}</span>
          </Tooltip>
          {onShare && (
            <Tooltip content="Share current view" placement="bottom">
              <button
                onClick={onShare}
                className="text-muted hover:text-heading transition-colors cursor-pointer p-1"
                aria-label="Share current view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            </Tooltip>
          )}
          {onOpenOnboarding && (
            <button
              onClick={onOpenOnboarding}
              className="text-muted hover:text-heading transition-colors cursor-pointer p-1"
              title="Open guided tour"
              aria-label="Help & onboarding"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
            </button>
          )}
          <button
            onClick={toggleTheme}
            className="text-muted hover:text-heading transition-colors cursor-pointer p-1"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </button>
          <button
            onClick={logout}
            className="text-muted hover:text-heading transition-colors cursor-pointer"
            title="Sign out"
            aria-label="Sign out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
