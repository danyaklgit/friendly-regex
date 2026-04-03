import { useState } from 'react';
import { TagsHierarchyTab } from '../tagsHierarchy/TagsHierarchyTab';
import { AttributesPage } from '../attributes/AttributesPage';

const SUB_TABS = [
  { key: 'tags', label: 'Tags Hierarchy', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
  { key: 'attributes', label: 'Attributes', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
] as const;

export function SettingsTab() {
  const [activeSubTab, setActiveSubTab] = useState(0);

  return (
    <div className="flex gap-0 min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <div className="w-44 shrink-0 border-r border-border bg-surface-secondary/50 py-2 px-1.5">
        <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Settings</p>
        {SUB_TABS.map((tab, i) => (
          <button
            key={tab.key}
            type="button"
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
      <div className="flex-1 p-4 overflow-y-auto">
        {activeSubTab === 0 && <TagsHierarchyTab />}
        {activeSubTab === 1 && <AttributesPage />}
      </div>
    </div>
  );
}
