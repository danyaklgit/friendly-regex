import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AndGroupFormValue, ConditionFormValue } from '../../types';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { RuleGroupEditor } from '../wizard/RuleGroupEditor';
import { computeDuplicateGroupIndexes, isFilledCondition } from '../../utils/ruleFingerprint';

interface MatchingRulesFilterButtonProps {
  /** Currently-applied rule groups. Empty array means the filter is off. */
  value: AndGroupFormValue[];
  /** Fires with the next applied groups when the operator clicks Apply.
   *  An empty array means the operator cleared the filter. */
  onChange: (next: AndGroupFormValue[]) => void;
}

/**
 * Filter-row chip that lets the operator construct ad-hoc matching rules
 * and use them as a server-side filter on GetMT940Transactions. Mirrors
 * the Rule Builder's matching-rules UI (same RuleGroupEditor +
 * ConditionEditor components) but is frontend-only — clicking Apply
 * just commits the rule groups to the parent's state, which is then
 * folded into `activeExtraFilters` as a REGEX FilterProperty via
 * `buildRegexFilterFromRuleGroups`.
 *
 * The draft state lives inside the modal so Cancel doesn't leak
 * mid-edit changes back to the applied filter. Apply copies the draft
 * onto the committed value; Clear empties the draft so the operator
 * can build a fresh set from scratch without first closing+reopening.
 */
export function MatchingRulesFilterButton({ value, onChange }: MatchingRulesFilterButtonProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AndGroupFormValue[]>(value);

  // Re-seed the draft from the committed value whenever the modal opens
  // (or the parent updates the applied set out-of-band, e.g. via Clear
  // Filters / Refresh). Closing-then-reopening should always show the
  // operator the currently-applied rules, not yesterday's draft.
  useEffect(() => {
    if (open) setDraft(value.length > 0 ? cloneGroups(value) : [createEmptyGroup()]);
  }, [open, value]);

  const appliedCount = useMemo(() => {
    // Count rule sets that actually carry a filled condition — empty
    // placeholder groups don't contribute to the filter so the chip
    // shouldn't claim they do.
    return value.reduce((n, g) => (g.conditions.some(isFilledCondition) ? n + 1 : n), 0);
  }, [value]);
  const isActive = appliedCount > 0;

  const draftDuplicateIndexes = useMemo(() => computeDuplicateGroupIndexes(draft), [draft]);

  // --- Draft mutators (mirror useWizardForm's shape so the editor
  // component sees the same callback API it does inside the full rule
  // builder). All inline because the draft is local; there's no
  // wizard-level form state to hook into. ---

  const addRuleGroup = useCallback(() => {
    setDraft((prev) => [...prev, createEmptyGroup()]);
  }, []);

  const removeRuleGroup = useCallback((groupId: string) => {
    setDraft((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  const cloneRuleGroup = useCallback((groupId: string) => {
    setDraft((prev) => {
      const idx = prev.findIndex((g) => g.id === groupId);
      if (idx === -1) return prev;
      const source = prev[idx];
      const cloned: AndGroupFormValue = {
        id: crypto.randomUUID(),
        conditions: source.conditions.map((c) => ({ ...c, id: crypto.randomUUID() })),
      };
      const next = [...prev];
      next.splice(idx + 1, 0, cloned);
      return next;
    });
  }, []);

  const addCondition = useCallback((groupId: string) => {
    setDraft((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, conditions: [...g.conditions, createEmptyCondition()] } : g,
      ),
    );
  }, []);

  const removeCondition = useCallback((groupId: string, conditionId: string) => {
    setDraft((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, conditions: g.conditions.filter((c) => c.id !== conditionId) } : g,
      ),
    );
  }, []);

  const updateCondition = useCallback(
    (groupId: string, conditionId: string, updates: Partial<ConditionFormValue>) => {
      setDraft((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                conditions: g.conditions.map((c) => (c.id === conditionId ? { ...c, ...updates } : c)),
              }
            : g,
        ),
      );
    },
    [],
  );

  const handleApply = () => {
    // Strip empty groups before commit — they'd just be noise in the
    // applied state, and the chip's count derives from filled groups
    // anyway. If everything was empty we apply an empty array (filter
    // off), matching the Clear semantics.
    const cleaned = draft.filter((g) => g.conditions.some(isFilledCondition));
    onChange(cleaned);
    setOpen(false);
  };

  const handleClear = () => {
    // Drop the applied filter AND reset the draft to a fresh empty
    // rule set, but KEEP the modal open so the operator can build a
    // new set from scratch without reopening. Cancel is the right
    // action for "close without applying"; Clear filter is purely
    // about wiping values. Closing on Clear would be a UX trap: the
    // operator who clicks Clear meaning "let me start over" would
    // have to reopen the modal every time.
    onChange([]);
    setDraft([createEmptyGroup()]);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={isActive
          ? `${appliedCount} matching rule set${appliedCount === 1 ? '' : 's'} active`
          : 'Filter by matching rules — same construction as the Rule Builder'}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
          isActive
            ? 'bg-primary border-primary text-white hover:opacity-90'
            : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L14 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
        </svg>
        Matching Rules
        {isActive && (
          <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-semibold leading-none">
            {appliedCount}
          </span>
        )}
      </button>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Filter by matching rules"
          widthClass="max-w-5xl"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={handleClear} disabled={!isActive && draft.every((g) => !g.conditions.some(isFilledCondition))}>
                Clear filter
              </Button>
              <Button variant="primary" onClick={handleApply}>
                Apply
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Each rule set uses AND logic (all conditions must match). Multiple rule sets use OR logic (any set can match).
              The active filter pipes into GetMT940Transactions as a REGEX FilterProperty so the table reflects the rules
              at the server level.
            </p>
            <div className="space-y-2">
              {draft.map((group, gi) => (
                <RuleGroupEditor
                  key={group.id}
                  group={group}
                  groupIndex={gi}
                  onAddCondition={() => addCondition(group.id)}
                  onRemoveCondition={(conditionId) => removeCondition(group.id, conditionId)}
                  onUpdateCondition={(conditionId, updates) => updateCondition(group.id, conditionId, updates)}
                  onRemoveGroup={() => removeRuleGroup(group.id)}
                  onCloneGroup={() => cloneRuleGroup(group.id)}
                  canRemoveGroup={draft.length > 1}
                  duplicateOfGroupIndex={draftDuplicateIndexes[gi]}
                />
              ))}
            </div>
            <Button variant="ghost" size="xs" onClick={addRuleGroup}>
              + Add Rule Set
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function createEmptyCondition(): ConditionFormValue {
  return {
    id: crypto.randomUUID(),
    sourceField: '',
    operation: '' as ConditionFormValue['operation'],
    value: '',
  };
}

function createEmptyGroup(): AndGroupFormValue {
  return {
    id: crypto.randomUUID(),
    conditions: [createEmptyCondition()],
  };
}

/** Deep-clone the committed groups before seeding the draft so edits
 *  inside the modal don't mutate the parent's state mid-flow. */
function cloneGroups(groups: AndGroupFormValue[]): AndGroupFormValue[] {
  return groups.map((g) => ({
    id: g.id,
    conditions: g.conditions.map((c) => ({ ...c })),
  }));
}
