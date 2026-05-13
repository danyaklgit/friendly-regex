import { useMemo, useState, type ReactNode } from 'react';
import type { TagSpecDefinition, TagSpecLibrary } from '../../types';
import { getContextValue, getRegexDescription } from '../../types/tagSpec';
import { engregxify } from '../../utils/engregxify';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';
import { CopyableId } from '../shared/CopyableId';

interface SourceTagPickerModalProps {
  open: boolean;
  libraries: TagSpecLibrary[];
  onClose: () => void;
  onSelect: (def: TagSpecDefinition) => void;
}

interface PickerEntry {
  def: TagSpecDefinition;
  txnType: string;
  bank: string;
  side: string;
}

function hasContent(def: TagSpecDefinition): boolean {
  return def.TagRuleExpressions.length > 0 || def.Attributes.length > 0;
}

function renderRulesAndAttributesTooltip(def: TagSpecDefinition): ReactNode {
  const groups = def.TagRuleExpressions;
  const hasRules = groups.some((g) => g.length > 0);
  return (
    <div className="space-y-2 max-w-sm">
      <div className="space-y-0.5">
        <div className="text-[10px] uppercase tracking-wide text-faint">Rules</div>
        {hasRules ? (
          groups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && (
                <div className="text-[9px] font-bold text-purple-500 my-0.5">OR</div>
              )}
              <div className="space-y-0.5">
                {group.map((cond, ci) => {
                  const text =
                    getRegexDescription(cond.RegexDetails) ||
                    cond.ExpressionPrompt ||
                    engregxify(cond.Regex);
                  return (
                    <div key={ci} className="flex flex-wrap items-baseline gap-x-1.5 leading-snug">
                      {ci > 0 && (
                        <span className="text-[9px] font-bold text-amber-600">AND</span>
                      )}
                      <span className="font-mono text-[10px] font-semibold text-primary-dark">
                        {humanizeFieldName(cond.SourceField)}
                      </span>
                      <span className="text-[11px]">{text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="text-[11px] italic text-faint">No rule sets.</div>
        )}
      </div>
      <div className="space-y-0.5 pt-1.5 border-t border-border/60">
        <div className="text-[10px] uppercase tracking-wide text-faint">Attributes</div>
        {def.Attributes.length === 0 ? (
          <div className="text-[11px] italic text-faint">No attributes.</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {def.Attributes.map((attr) => (
              <span
                key={attr.AttributeTag}
                className="text-[10px] font-medium bg-surface-secondary border border-border rounded-full px-2 py-0.5"
              >
                {attr.AttributeTag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SourceTagPickerModal({ open, libraries, onClose, onSelect }: SourceTagPickerModalProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Walk libraries so each entry carries its parent context (Side, BankSwiftCode).
  // Dedupe by def.Id since the same definition can appear in both an INPROGRESS
  // draft library and the ACTIVE released library during a checkout — duplicate
  // <li key={def.Id}> entries previously broke React's reconciliation when the
  // filter shrank the list.
  const eligibleEntries = useMemo<PickerEntry[]>(() => {
    const seen = new Set<string>();
    const result: PickerEntry[] = [];
    for (const lib of libraries) {
      const bank = getContextValue(lib.Context, 'BankSwiftCode') ?? '';
      const side = getContextValue(lib.Context, 'Side') ?? '';
      for (const def of lib.TagSpecDefinitions) {
        if (!hasContent(def)) continue;
        if (seen.has(def.Id)) continue;
        seen.add(def.Id);
        const txnType = getContextValue(def.Context, 'TransactionTypeCode') ?? '';
        result.push({ def, txnType, bank, side });
      }
    }
    return result;
  }, [libraries]);

  const term = search.trim().toLowerCase();
  const visibleEntries = term
    ? eligibleEntries.filter((e) => {
        return (
          e.def.Tag.toLowerCase().includes(term) ||
          e.def.Id.toLowerCase().includes(term) ||
          e.txnType.toLowerCase().includes(term) ||
          e.bank.toLowerCase().includes(term) ||
          e.side.toLowerCase().includes(term)
        );
      })
    : eligibleEntries;

  const selectedEntry = useMemo(
    () => (selectedId ? eligibleEntries.find((e) => e.def.Id === selectedId) ?? null : null),
    [selectedId, eligibleEntries],
  );

  const handleClose = () => {
    setSearch('');
    setSelectedId(null);
    onClose();
  };

  const handleConfirm = () => {
    if (!selectedEntry) return;
    onSelect(selectedEntry.def);
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
          <Button variant="primary" onClick={handleConfirm} disabled={!selectedEntry}>
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
            placeholder="Search by tag name, id, transaction type, bank, or side..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input-border bg-input-bg text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
        </div>

        {visibleEntries.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted">
            {eligibleEntries.length === 0
              ? 'No existing tags have rules or attributes to duplicate.'
              : 'No tags match your search.'}
          </div>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {visibleEntries.map((entry) => {
              const isSelected = entry.def.Id === selectedId;
              const metaParts = [entry.txnType, entry.bank, entry.side].filter(Boolean);
              return (
                <li key={entry.def.Id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(entry.def.Id)}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-colors
                      ${isSelected ? 'bg-primary/15 hover:bg-primary/20' : 'hover:bg-surface-active'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-heading'}`}>
                          {entry.def.Tag}
                        </span>
                        <CopyableId id={entry.def.Id} />
                      </div>
                      {metaParts.length > 0 && (
                        <div className="text-xs text-muted truncate">
                          {metaParts.join(' · ')}
                        </div>
                      )}
                    </div>
                    <Tooltip content={renderRulesAndAttributesTooltip(entry.def)} placement="left">
                      <span className="shrink-0 text-xs font-medium text-body-secondary bg-surface-secondary border border-border rounded-full px-2.5 py-1 cursor-help">
                        {entry.def.TagRuleExpressions.length} rule {entry.def.TagRuleExpressions.length === 1 ? 'set' : 'sets'} · {entry.def.Attributes.length} {entry.def.Attributes.length === 1 ? 'attribute' : 'attributes'}
                      </span>
                    </Tooltip>
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
