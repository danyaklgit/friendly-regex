import { useMemo, useState, type ReactNode } from 'react';
import type { TagSpecDefinition, TagSpecLibrary } from '../../types';
import { getContextValue, getRegexDescription } from '../../types/tagSpec';
import { engregxify } from '../../utils/engregxify';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';
import { CopyableId } from '../shared/CopyableId';
import { DATA_SET_TYPE_LABELS, DEFAULT_DATA_SET_TYPE, type DataSetType } from '../../constants/dataSetTypes';
import { isLedger } from '../../utils/libraryIdentity';

interface SourceTagPickerModalProps {
  open: boolean;
  libraries: TagSpecLibrary[];
  onClose: () => void;
  onSelect: (def: TagSpecDefinition) => void;
  /** Active checkout context — scopes/ranks the list so an operator tagging
   *  an intraday (MT942 / INTERIM_MT940) bank/side sees the matching MT940
   *  rules first (the ones worth cloning). Optional: when absent the list is
   *  unscoped and alphabetical. */
  currentBank?: string | null;
  currentSide?: string | null;
  currentDataSetType?: string | null;
}

interface PickerEntry {
  def: TagSpecDefinition;
  txnType: string;
  bank: string;
  side: string;
  dataSetType: string;
}

const sideLabel: Record<string, string> = {
  CR: 'Credit',
  DR: 'Debit',
  RC: 'Rev. Credit',
  RD: 'Rev. Debit',
};

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

export function SourceTagPickerModal({ open, libraries, onClose, onSelect, currentBank, currentSide, currentDataSetType }: SourceTagPickerModalProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // When a checkout bank is known, default to that bank only — the operator is
  // almost always cloning from the same bank. "Show all banks" reveals the
  // rest. No current bank ⇒ nothing to scope, so show everything.
  const [showAllBanks, setShowAllBanks] = useState(false);

  // Walk libraries so each entry carries its parent context (Side, BankSwiftCode).
  // Dedupe by def.Id since the same definition can appear in both an INPROGRESS
  // draft library and the ACTIVE released library during a checkout — duplicate
  // <li key={def.Id}> entries previously broke React's reconciliation when the
  // filter shrank the list.
  //
  // When a definition exists in more than one library version, ALWAYS prefer
  // the most current one: the INPROGRESS (checked-out) draft over the ACTIVE
  // released copy, and among same-status libraries the higher Version. This
  // makes "Duplicate Rules From Tag" clone the operator's latest in-progress
  // rules/attributes, not a stale released snapshot. `score` ranks candidates
  // for the same def.Id; the highest score wins (matches the reducer's
  // "prefer INPROGRESS" merge in TagSpecContext).
  const eligibleEntries = useMemo<PickerEntry[]>(() => {
    const byId = new Map<string, { entry: PickerEntry; score: number }>();
    for (const lib of libraries) {
      const bank = getContextValue(lib.Context, 'BankSwiftCode') ?? '';
      const side = getContextValue(lib.Context, 'Side') ?? '';
      const score = (lib.StatusTag === 'INPROGRESS' ? 1_000_000 : 0) + (lib.Version ?? 0);
      for (const def of lib.TagSpecDefinitions) {
        if (!hasContent(def)) continue;
        const existing = byId.get(def.Id);
        if (existing && existing.score >= score) continue;
        const txnType = getContextValue(def.Context, 'TransactionTypeCode') ?? '';
        byId.set(def.Id, { entry: { def, txnType, bank, side, dataSetType: lib.DataSetType }, score });
      }
    }
    let result: PickerEntry[] = Array.from(byId.values(), (v) => v.entry);
    // Ledger rules never clone across DataSetTypes: the source fields,
    // transaction types, and identity model are all different, so a bank/
    // intraday rule pasted into a Ledger tag would reference fields Ledger
    // rows don't carry. Offer ONLY Ledger definitions when tagging Ledger.
    if (isLedger(currentDataSetType)) {
      result = result.filter((e) => isLedger(e.dataSetType));
    }
    // Relevance rank for the operator's current context: same bank, then same
    // side, then MT940 (the confirmed base workspace whose rules an intraday
    // tag clones from) float to the top. Falls back to a pure alphabetical
    // sort when there's no checkout context. Def Id is the stable tiebreaker.
    const rank = (e: PickerEntry) => {
      let r = 0;
      if (currentBank && e.bank === currentBank) r += 8;
      if (currentSide && e.side === currentSide) r += 4;
      if (e.dataSetType === DEFAULT_DATA_SET_TYPE) r += 2;
      return r;
    };
    result.sort((a, b) => {
      const byRank = rank(b) - rank(a);
      if (byRank !== 0) return byRank;
      const byTag = a.def.Tag.localeCompare(b.def.Tag, undefined, { sensitivity: 'base' });
      return byTag !== 0 ? byTag : a.def.Id.localeCompare(b.def.Id);
    });
    return result;
  }, [libraries, currentBank, currentSide, currentDataSetType]);

  // Bank scope: default to the checkout bank unless the operator opted into
  // "Show all banks" (or there's no current bank to scope by).
  const bankScoped = !showAllBanks && !!currentBank;
  const scopedEntries = bankScoped
    ? eligibleEntries.filter((e) => e.bank === currentBank)
    : eligibleEntries;

  const term = search.trim().toLowerCase();
  const visibleEntries = term
    ? scopedEntries.filter((e) => {
        return (
          e.def.Tag.toLowerCase().includes(term) ||
          e.def.Id.toLowerCase().includes(term) ||
          e.txnType.toLowerCase().includes(term) ||
          e.bank.toLowerCase().includes(term) ||
          e.side.toLowerCase().includes(term)
        );
      })
    : scopedEntries;

  const selectedEntry = useMemo(
    () => (selectedId ? eligibleEntries.find((e) => e.def.Id === selectedId) ?? null : null),
    [selectedId, eligibleEntries],
  );

  const currentDataSetTypeLabel = currentDataSetType
    ? (DATA_SET_TYPE_LABELS[currentDataSetType as DataSetType] ?? currentDataSetType)
    : null;
  const currentSideLabel = currentSide ? (sideLabel[currentSide] ?? currentSide) : null;
  // Intraday workspaces borrow MT940's rules — that's the case where "MT940
  // rules for this bank/side, first" is the actionable hint.
  const isIntraday = currentDataSetType != null && currentDataSetType !== DEFAULT_DATA_SET_TYPE;

  const handleClose = () => {
    setSearch('');
    setSelectedId(null);
    setShowAllBanks(false);
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

        {!currentBank && isLedger(currentDataSetType) && (
          <div className="text-xs text-muted">
            Tagging <span className="font-medium text-body-secondary">{currentDataSetTypeLabel}</span> —{' '}
            only Ledger tags are offered as templates.
          </div>
        )}

        {currentBank && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-muted min-w-0">
              {isIntraday ? (
                <>
                  Tagging <span className="font-medium text-body-secondary">{currentDataSetTypeLabel}</span>
                  {' · '}{currentBank}{currentSideLabel ? ` · ${currentSideLabel}` : ''} —{' '}
                  <span className="text-body-secondary">MT940 rules for this bank/side are listed first</span> to clone.
                </>
              ) : (
                <>Showing tags for <span className="font-medium text-body-secondary">{currentBank}</span>.</>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowAllBanks((v) => !v)}
              className="text-xs font-medium text-primary hover:underline cursor-pointer whitespace-nowrap shrink-0"
            >
              {showAllBanks ? `Show only ${currentBank}` : 'Show all banks'}
            </button>
          </div>
        )}

        {visibleEntries.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted">
            {eligibleEntries.length === 0
              ? 'No existing tags have rules or attributes to duplicate.'
              : bankScoped && !term
                ? `No tags with rules for ${currentBank}. Use "Show all banks" to clone from another bank.`
                : 'No tags match your search.'}
          </div>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {visibleEntries.map((entry) => {
              const isSelected = entry.def.Id === selectedId;
              const metaParts = [entry.txnType, entry.bank, entry.side].filter(Boolean);
              return (
                <li key={entry.def.Id}>
                  {/* Tooltip wraps the WHOLE row (not just the count pill) so
                      hovering anywhere on the entry previews its matching
                      rules + attributes before picking it. Lazy content —
                      only built when the tooltip actually opens. */}
                  <Tooltip content={() => renderRulesAndAttributesTooltip(entry.def)} placement="left">
                    <button
                      type="button"
                      onClick={() => setSelectedId(entry.def.Id)}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-colors
                        ${isSelected ? 'bg-primary/15 hover:bg-primary/20' : 'hover:bg-surface-active'}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span
                            className={`shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5 border ${
                              entry.dataSetType === DEFAULT_DATA_SET_TYPE
                                ? 'bg-primary/10 text-primary-dark dark:text-primary border-primary/30'
                                : 'bg-surface-secondary text-muted border-border'
                            }`}
                          >
                            {DATA_SET_TYPE_LABELS[entry.dataSetType as DataSetType] ?? entry.dataSetType}
                          </span>
                          <span className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-heading'}`}>
                            {entry.def.Tag}
                          </span>
                          {entry.def.Nickname && (
                            <span
                              className="shrink-0 max-w-[140px] truncate rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary-dark dark:text-primary"
                              title={entry.def.Nickname}
                            >
                              {entry.def.Nickname}
                            </span>
                          )}
                          <CopyableId id={entry.def.Id} />
                        </div>
                        {metaParts.length > 0 && (
                          <div className="text-xs text-muted truncate">
                            {metaParts.join(' · ')}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-medium text-body-secondary bg-surface-secondary border border-border rounded-full px-2.5 py-1 cursor-help">
                        {entry.def.TagRuleExpressions.length} rule {entry.def.TagRuleExpressions.length === 1 ? 'set' : 'sets'} · {entry.def.Attributes.length} {entry.def.Attributes.length === 1 ? 'attribute' : 'attributes'}
                      </span>
                    </button>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
