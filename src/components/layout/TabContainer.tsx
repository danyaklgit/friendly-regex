import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';

interface Tab {
  label: string;
  content: ReactNode;
}

interface TabContainerProps {
  tabs: Tab[];
  activeIndex: number;
  onTabChange: (index: number) => void;
}

export function TabContainer({ tabs, activeIndex, onTabChange }: TabContainerProps) {
  return (
    <div>
      <PageHeader tabs={tabs} activeIndex={activeIndex} onTabChange={onTabChange} />
      <div className="max-w-10xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {tabs[activeIndex].content}
      </div>
    </div>
  );
}
