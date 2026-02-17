import { useState, type ReactNode } from 'react';
import { PageHeader } from './PageHeader';

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
      <PageHeader tabs={tabs} activeIndex={activeIndex} onTabChange={setActiveIndex} />
      <div className="max-w-10xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {tabs[activeIndex].content}
      </div>
    </div>
  );
}
