import { useState } from 'react';
import { TagsHierarchyTab } from '../tagsHierarchy/TagsHierarchyTab';
import { AttributesPage } from '../attributes/AttributesPage';
import { ExtractionsPage } from '../extractions/ExtractionsPage';
import { LovsPage } from '../lovs/LovsPage';
import { VIPCustomersPage } from '../vipCustomers/VIPCustomersPage';

const SUB_TABS = [
  { key: 'tags', label: 'Tags Hierarchy', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z', tour: 'settings-subtab-tags' },
  { key: 'attributes', label: 'Attributes', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16', tour: 'settings-subtab-attributes' },
  { key: 'extractions', label: 'Extractions', icon: 'M7 8h10M7 12h10M7 16h6M3 4h18v16H3z', tour: 'settings-subtab-extractions' },
  { key: 'lovs', label: 'LOVs', icon: 'M3 6h13M3 10h13M3 14h13M3 18h13M20 6h.01M20 10h.01M20 14h.01M20 18h.01', tour: 'settings-subtab-lovs' },
  { key: 'vip', label: 'VIP Customers', icon: 'M11.48 3.5l2.09 4.24 4.68.68-3.39 3.3.8 4.66-4.18-2.2-4.18 2.2.8-4.66-3.39-3.3 4.68-.68z', tour: 'settings-subtab-vip' },
] as const;

interface SettingsTabProps {
  /** Height of the settings surface. The main-menu tab fills the viewport
   *  under the header; the rule builder's Settings modal passes "h-full" so
   *  the modal controls the size. */
  heightClass?: string;
}

export function SettingsTab({ heightClass = 'h-[calc(100vh-3.5rem)]' }: SettingsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState(0);

  return (
    <div className={`flex gap-0 ${heightClass}`}>
      {/* Sidebar */}
      <div className="w-44 shrink-0 border-r border-border bg-surface-secondary/50 py-2 px-1.5">
        <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Settings</p>
        {SUB_TABS.map((tab, i) => (
          <button
            key={tab.key}
            type="button"
            data-tour={tab.tour}
            onClick={() => setActiveSubTab(i)}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
              activeSubTab === i
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-body-secondary hover:bg-surface-hover'
            }`}
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-hidden min-h-0 flex flex-col">
        {activeSubTab === 0 && <TagsHierarchyTab />}
        {activeSubTab === 1 && <AttributesPage />}
        {activeSubTab === 2 && <ExtractionsPage />}
        {activeSubTab === 3 && <LovsPage />}
        {activeSubTab === 4 && <VIPCustomersPage />}
      </div>
    </div>
  );
}
