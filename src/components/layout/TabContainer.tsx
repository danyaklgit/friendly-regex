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
  dataSetType: string;
  clientCode?: string;
  erpCode?: string;
  hasChanges: boolean;
  isReadOnly?: boolean;
  actionLoading?: boolean;
  /** Tooltip shown when Release / Check-in are disabled (forwarded to
   *  PageHeader). Pairs with `actionLoading=true` to explain WHY the
   *  buttons are unavailable — e.g. while a rule is being authored. */
  disabledReason?: string;
  onRelease: (bank: string, side: string, dataSetType: string) => void;
  onCheckin: (bank: string, side: string, dataSetType: string) => void;
  onRequestUndo?: (bank: string, side: string, dataSetType: string) => void;
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
