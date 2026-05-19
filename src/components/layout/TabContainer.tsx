import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';
import type { TagSpecCommentTarget } from '../../types/comments';

interface Tab {
  label: string;
  content: ReactNode;
}

interface CheckoutInfo {
  bank: string;
  side: string;
  hasChanges: boolean;
  isReadOnly?: boolean;
  actionLoading?: boolean;
  onRelease: (bank: string, side: string) => void;
  onCheckin: (bank: string, side: string) => void;
  onRequestUndo?: (bank: string, side: string) => void;
}

interface TabContainerProps {
  tabs: Tab[];
  activeIndex: number;
  onTabChange: (index: number) => void;
  checkout?: CheckoutInfo;
  onOpenOnboarding?: () => void;
  onShare?: () => void;
  onNavigateToBacklog?: (target: TagSpecCommentTarget) => void;
}

export function TabContainer({ tabs, activeIndex, onTabChange, checkout, onOpenOnboarding, onShare, onNavigateToBacklog }: TabContainerProps) {
  return (
    <div>
      <PageHeader tabs={tabs} activeIndex={activeIndex} onTabChange={onTabChange} checkout={checkout} onOpenOnboarding={onOpenOnboarding} onShare={onShare} onNavigateToBacklog={onNavigateToBacklog} />
      <div className="max-w-10xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {tabs[activeIndex].content}
      </div>
    </div>
  );
}
