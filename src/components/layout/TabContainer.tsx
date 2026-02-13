import { useState, type ReactNode } from 'react';

interface Tab {
  label: string;
  content: ReactNode;
}

interface TabContainerProps {
  tabs: Tab[];
}

export function TabContainer({ tabs }: TabContainerProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div>
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-10xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-6" aria-label="Tabs">
            {tabs.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => setActiveIndex(i)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer
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
        </div>
      </div>
      <div className="max-w-10xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {tabs[activeIndex].content}
      </div>
    </div>
  );
}
