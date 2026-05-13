import { useMemo, useState } from 'react';
import type { TagSpecDefinition } from '../../types';
import { getContextValue } from '../../types/tagSpec';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Input } from '../shared/Input';

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

  const eligibleDefinitions = useMemo(
    () => definitions.filter(hasContent),
    [definitions],
  );

  const visibleDefinitions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return eligibleDefinitions;
    return eligibleDefinitions.filter((def) => {
      const txnType = getContextValue(def.Context, 'TransactionTypeCode') ?? '';
      return (
        def.Tag.toLowerCase().includes(term) ||
        txnType.toLowerCase().includes(term)
      );
    });
  }, [eligibleDefinitions, search]);

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
        <Input
          placeholder="Search by tag name or transaction type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

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
