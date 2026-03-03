import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

interface PageHeaderProps {
  tabs: { label: string }[];
  activeIndex: number;
  onTabChange: (index: number) => void;
}

export function PageHeader({ tabs, activeIndex, onTabChange }: PageHeaderProps) {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

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
        <div className="ml-auto flex items-center gap-3">
          {/* <span className="text-xs text-body">Welcome, {username}</span> */}
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
