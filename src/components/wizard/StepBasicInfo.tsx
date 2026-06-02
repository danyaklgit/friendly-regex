import { useState } from 'react';
import type { WizardFormState } from '../../types';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { TagTreePicker } from '../shared/TagTreePicker';
import { Select } from '../shared/Select';
import { Button } from '../shared/Button';
import { CERTAINTY_OPTIONS, SIDE_OPTIONS, TXN_TYPE_OPTIONS, BANK_SWIFT_CODE_OPTIONS } from '../../constants/fields';
import { WizardCommentIconButton } from './WizardCommentIconButton';
import { WIZARD_DEFINITION_FORM_KEY } from '../../context/WizardCommentDraftsContext';

interface StepBasicInfoProps {
  formState: WizardFormState;
  onUpdate: (updates: Partial<Pick<WizardFormState, 'tag' | 'side' | 'bankSwiftCode' | 'transactionTypeCode' | 'statusTag' | 'certaintyLevelTag' | 'validity'>>) => void;
  fromCheckoutContext?: boolean;
  /** Read-only flag for the entire step. When true, all writable controls
   *  are disabled and the +Add / Remove / per-picker × affordances on the
   *  Validity section are suppressed. The wizard modal isn't opened in
   *  read-only contexts today, but the prop is accepted so future callers
   *  can honor the contract without changes here. */
  readOnly?: boolean;
  libraryIdForComments?: string | null;
  definitionIdForComments?: string;
}

export function StepBasicInfo({
  formState,
  onUpdate,
  fromCheckoutContext,
  readOnly,
  libraryIdForComments,
  definitionIdForComments,
}: StepBasicInfoProps) {
  const { tagsHierarchy, tagsHierarchyLoading } = useTagSpecs();
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const markTouched = (field: string) => setTouched((prev) => new Set(prev).add(field));

  // Tag name is always required
  const isTagError = touched.has('tag') && formState.tag.trim().length === 0;

  // The Validity section starts expanded when the definition already has at
  // least one date set (edit-mode entry), and collapsed otherwise. The local
  // `showValidity` only governs UI visibility — the underlying dates always
  // live in `formState.validity` so collapse-with-cleared-dates and explicit
  // null-null are indistinguishable to downstream consumers.
  const [showValidity, setShowValidity] = useState<boolean>(
    () => !!(formState.validity.StartDate || formState.validity.EndDate),
  );

  // Normalize whatever the form state holds into a bare YYYY-MM-DD before
  // it reaches the <input type="date"> or the X-button gate. The backend can
  // ship `Validity.StartDate` as a full ISO datetime ("2024-01-01T00:00:00")
  // for legacy reasons, which the native date input rejects (it falls back
  // to the placeholder), but the raw string is still truthy — that would
  // light up the per-picker × even when the input visually reads as empty.
  const toDateInputValue = (raw: string | null | undefined): string =>
    raw ? String(raw).split('T')[0] : '';
  const validityStart = toDateInputValue(formState.validity.StartDate);
  const validityEnd = toDateInputValue(formState.validity.EndDate);
  // Lexicographic compare on YYYY-MM-DD ISO strings; no Date parsing needed.
  const validityRangeInvalid =
    !!validityStart && !!validityEnd && validityStart > validityEnd;

  const updateValidity = (next: Partial<{ StartDate: string | null; EndDate: string | null }>) => {
    onUpdate({
      validity: {
        StartDate: next.StartDate !== undefined ? next.StartDate : formState.validity.StartDate,
        EndDate: next.EndDate !== undefined ? next.EndDate : formState.validity.EndDate,
      },
    });
  };

  const handleAddValidity = () => setShowValidity(true);
  const handleRemoveValidity = () => {
    updateValidity({ StartDate: null, EndDate: null });
    setShowValidity(false);
  };

  return (
    <div className="space-y-4">
      <div data-tour="wizard-tag-picker">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TagTreePicker
              label="Tag"
              nodes={tagsHierarchy}
              value={formState.tag}
              onChange={(tag) => { onUpdate({ tag }); markTouched('tag'); }}
              loading={tagsHierarchyLoading}
              required
              error={isTagError}
              collapseOnSelect
            />
          </div>
          {libraryIdForComments && (
            <div className="pb-1">
              <WizardCommentIconButton
                formKey={WIZARD_DEFINITION_FORM_KEY}
                kind="definition"
                targetLabel={formState.tag || 'New tag'}
                persistedTarget={
                  definitionIdForComments
                    ? {
                        TagSpecLibraryId: libraryIdForComments,
                        TagSpecDefinitionId: definitionIdForComments,
                      }
                    : null
                }
                title="Comment on this tag (queued until Save)"
              />
            </div>
          )}
        </div>
      </div>

      <div data-tour="wizard-basic-info-fields" className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Select
            label="Side"
            value={formState.side}
            onChange={(e) => onUpdate({ side: e.target.value })}
            options={SIDE_OPTIONS.map((s) => ({ value: s, label: s }))}
            disabled={fromCheckoutContext}
          />
          <Select
            label="Bank Swift Code"
            value={formState.bankSwiftCode}
            onChange={(e) => onUpdate({ bankSwiftCode: e.target.value })}
            options={BANK_SWIFT_CODE_OPTIONS.map((s) => ({ value: s, label: s }))}
            disabled={fromCheckoutContext}
          />
          <div data-tour="wizard-transaction-type">
            <Select
              label="Transaction Type"
              value={formState.transactionTypeCode}
              onChange={(e) => { onUpdate({ transactionTypeCode: e.target.value }); markTouched('transactionTypeCode'); }}
              onBlur={() => markTouched('transactionTypeCode')}
              options={TXN_TYPE_OPTIONS.map((s) => ({ value: s, label: s }))}
              placeholder="Select transaction type"
              disabled={fromCheckoutContext}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Certainty Level"
            value={formState.certaintyLevelTag}
            onChange={(e) => onUpdate({ certaintyLevelTag: e.target.value as typeof formState.certaintyLevelTag })}
            options={CERTAINTY_OPTIONS.map((s) => ({ value: s, label: s }))}
          />
        </div>

        {/* Validity section. Collapsed by default until the operator clicks
            "+ Add Validity"; when collapsed the rule has no validity bounds
            and applies to every matching transaction. When expanded, both
            dates remain individually optional — clearing one bound keeps
            the other in effect. */}
        <div data-tour="wizard-validity">
          {showValidity ? (
            <div className="rounded-lg border border-border bg-surface-secondary px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-body uppercase tracking-wide">
                  Validity
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={handleRemoveValidity}
                    className="text-xs text-red-500 hover:text-red-600 dark:text-rose-300 dark:hover:text-rose-200 hover:underline transition-colors"
                  >
                    Remove Validity
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DateField
                  label="Valid From"
                  value={validityStart}
                  onChange={(v) => updateValidity({ StartDate: v || null })}
                  onClear={() => updateValidity({ StartDate: null })}
                  disabled={!!readOnly}
                />
                <DateField
                  label="Valid To"
                  value={validityEnd}
                  onChange={(v) => updateValidity({ EndDate: v || null })}
                  onClear={() => updateValidity({ EndDate: null })}
                  disabled={!!readOnly}
                  // Browser calendars (Chrome/Edge) gray out earlier days
                  // when `min` is set, paired with the Next-button gate as
                  // defense in depth for direct keyboard entry.
                  min={validityStart || undefined}
                  error={validityRangeInvalid}
                />
              </div>
              {validityRangeInvalid && (
                <p className="text-xs text-red-500 dark:text-rose-300">
                  Valid To cannot be earlier than Valid From.
                </p>
              )}
              <p className="text-[11px] text-muted">
                Both fields are optional. Empty fields mean the bound is unrestricted.
              </p>
            </div>
          ) : (
            !readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddValidity}
              >
                + Add Validity
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onClear: () => void;
  disabled: boolean;
  min?: string;
  error?: boolean;
}

/** Date input styled to match the wizard's other Basic Info fields, with a
 *  small × clear button that appears when the field has a value. Native
 *  `<input type="date">` so it picks up the OS calendar popup and accepts
 *  the same `YYYY-MM-DD` ISO strings the backend uses. */
function DateField({ label, value, onChange, onClear, disabled, min, error }: DateFieldProps) {
  const borderClass = error
    ? 'border-red-400 dark:border-rose-400 focus-within:border-red-500'
    : 'border-input-border focus-within:border-primary';
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-body pl-1">{label}</label>
      <div className={`flex items-center rounded-lg border ${borderClass} bg-input-bg transition-colors`}>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          min={min}
          className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-heading outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${label}`}
            title={`Clear ${label}`}
            className="shrink-0 inline-flex items-center justify-center w-7 h-7 mr-1 rounded text-faint hover:text-body hover:bg-surface-hover transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
