import { useMemo, useState } from 'react';
import type { TagSpecDefinition } from '../../types';
import { getContextValue } from '../../types/tagSpec';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';

interface SourceTagPickerModalProps {
  open: boolean;
  definitions: TagSpecDefinition[];
  onClose: () => void;
  onSelect: (def: TagSpecDefinition) => void;
}

function hasContent(def: TagSpecDefinition): boolean {
  return def.TagRuleExpressions.length > 0 || def.Attributes.length > 0;
}

export function SourceTagPickerModal({ open, definitions, onClose, onSelect }: SourceTagPickerModalProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Dedupe by Id: the same definition can appear in both INPROGRESS and ACTIVE
  // libraries (e.g. during a checkout). Duplicate <li key={def.Id}> entries
  // produce a React duplicate-key warning AND undefined reconciliation
  // behaviour — when the array shrinks during filtering, stale DOM is kept
  // around. Collapsing to unique definitions fixes both.
  const eligibleDefinitions = useMemo(() => {
    const seen = new Set<string>();
    const result: TagSpecDefinition[] = [];
    for (const def of definitions) {
      if (!hasContent(def)) continue;
      if (seen.has(def.Id)) continue;
      seen.add(def.Id);
      result.push(def);
    }
    return result;
  }, [definitions]);

  const term = search.trim().toLowerCase();
  const visibleDefinitions = term
    ? eligibleDefinitions.filter((def) => {
        const txnType = getContextValue(def.Context, 'TransactionTypeCode') ?? '';
        return (
          def.Tag.toLowerCase().includes(term) ||
          txnType.toLowerCase().includes(term)
        );
      })
    : eligibleDefinitions;

  const selectedDef = useMemo(
    () => (selectedId ? visibleDefinitions.find((d) => d.Id === selectedId) ?? null : null),
    [selectedId, visibleDefinitions],
  );

  const handleClose = () => {
    setSearch('');
    setSelectedId(null);
    onClose();
  };

  const handleConfirm = () => {
    if (!selectedDef) return;
    onSelect(selectedDef);
    setSearch('');
    setSelectedId(null);
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Duplicate Rules From Tag"
      zClass="z-[60]"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!selectedDef}>
            Use This Tag
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by tag name or transaction type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
        </div>

        {visibleDefinitions.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted">
            {eligibleDefinitions.length === 0
              ? 'No existing tags have rules or attributes to duplicate.'
              : 'No tags match your search.'}
          </div>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {visibleDefinitions.map((def) => {
              const txnType = getContextValue(def.Context, 'TransactionTypeCode') ?? '';
              const isSelected = def.Id === selectedId;
              return (
                <li key={def.Id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(def.Id)}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-colors
                      ${isSelected ? 'bg-primary/15 hover:bg-primary/20' : 'hover:bg-surface-active'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-heading'}`}>
                        {def.Tag}
                      </div>
                      {txnType && (
                        <div className="text-xs text-muted truncate">{txnType}</div>
                      )}
                    </div>
                    <span className="shrink-0 text-xs font-medium text-body-secondary bg-surface-secondary border border-border rounded-full px-2.5 py-1">
                      {def.TagRuleExpressions.length} rule {def.TagRuleExpressions.length === 1 ? 'set' : 'sets'} · {def.Attributes.length} {def.Attributes.length === 1 ? 'attribute' : 'attributes'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
