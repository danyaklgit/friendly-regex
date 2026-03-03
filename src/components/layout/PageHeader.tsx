import { useAuth } from '../../context/AuthContext';

interface PageHeaderProps {
  tabs: { label: string }[];
  activeIndex: number;
  onTabChange: (index: number) => void;
}

export function PageHeader({ tabs, activeIndex, onTabChange }: PageHeaderProps) {
  const { username, logout } = useAuth();

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-10xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-6 h-12">
        <h1 className="text-lg font-semibold text-gray-900 shrink-0">Transactions Enrichment Program</h1>
        <nav className="flex gap-4 h-full" aria-label="Tabs">
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => onTabChange(i)}
              className={`text-sm font-medium border-b-2 transition-colors cursor-pointer h-full flex items-center
                ${
                  i === activeIndex
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-700">Welcome, {username}</span>
          <button
            onClick={logout}
            className="text-xs text-slate-700 hover:text-gray-600 transition-colors cursor-pointer"
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
