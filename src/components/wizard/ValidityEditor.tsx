import { useState } from 'react';
import type { TagValidity } from '../../types';
import { Button } from '../shared/Button';
import { DateField, toDateInputValue } from '../shared/DateField';

interface ValidityEditorProps {
  /** Current validity bounds. `null` for either bound means "unbounded". */
  validity: TagValidity;
  /** Fired with the next validity shape on any edit. Both `null` means
   *  the operator cleared the section entirely. */
  onChange: (next: TagValidity) => void;
  /** When true the inputs are disabled and the +Add / Remove / × controls
   *  are suppressed, but any saved dates still render so operators can see
   *  the bound a checked-out rule carries. */
  readOnly?: boolean;
  /** Optional helper text below the inputs. Defaults to the standard
   *  "both fields optional" copy used by the wizard. Callers can override
   *  to add context-specific guidance (e.g. "Also filters the table"). */
  helperText?: string;
}

/**
 * Reusable Validity section: a `+ Add Validity` toggle that expands into
 * two optional date pickers (Valid From / Valid To) with per-picker × and a
 * section-level `Remove Validity` link. Used by:
 *
 *  - the standalone Tag Wizard's Basic Info step (StepBasicInfo)
 *  - the inline rule builder panel in TransactionsTab
 *
 * Keeping the implementation here means both surfaces share one ruleset for
 * input shape, sentinel normalization (via {@link toDateInputValue}), the
 * `min={Valid From}` constraint on Valid To, and the inverted-range error
 * line. The owning component decides how to plumb the dates further (form
 * state, the StatementDate filter pipeline, etc.).
 */
export function ValidityEditor({
  validity,
  onChange,
  readOnly,
  helperText = 'Both fields are optional. Empty fields mean the bound is unrestricted.',
}: ValidityEditorProps) {
  // Local visibility flag. Defaults open whenever either bound is already
  // set so edit-mode entry surfaces the saved range; otherwise collapsed.
  const [showValidity, setShowValidity] = useState<boolean>(
    () => !!(validity.StartDate || validity.EndDate),
  );

  const validityStart = toDateInputValue(validity.StartDate);
  const validityEnd = toDateInputValue(validity.EndDate);
  // Lexicographic compare on YYYY-MM-DD ISO strings; no Date parsing needed.
  const validityRangeInvalid = !!validityStart && !!validityEnd && validityStart > validityEnd;

  const update = (next: Partial<TagValidity>) => {
    const proposedStart = next.StartDate !== undefined ? next.StartDate : validity.StartDate;
    const proposedEnd = next.EndDate !== undefined ? next.EndDate : validity.EndDate;
    // Reject a Valid To update that would invert the range. The native
    // `min` attribute on the input grays earlier dates in Chrome/Edge but
    // some browsers (notably Firefox + several mobile chromes) still
    // accept selection or keyboard entry below it. This guard is the
    // authoritative gate: any change that would land EndDate < StartDate
    // is dropped silently so the form state can never hold an inverted
    // range from inside this editor.
    //
    // Changes to StartDate that temporarily invert the range are NOT
    // rejected — operators routinely shift the whole window forward by
    // editing one bound at a time, and blocking that flow would force a
    // remove-then-re-add round-trip. The inline error + Next-button gate
    // already cover the "save with inverted range" case.
    if (
      next.EndDate !== undefined
      && next.EndDate
      && proposedStart
      && next.EndDate < proposedStart
    ) {
      return;
    }
    onChange({
      StartDate: proposedStart,
      EndDate: proposedEnd,
    });
  };

  const handleAddValidity = () => setShowValidity(true);
  const handleRemoveValidity = () => {
    onChange({ StartDate: null, EndDate: null });
    setShowValidity(false);
  };

  return (
    <div data-tour="wizard-validity">
      {showValidity ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-3 space-y-2">
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
              onChange={(v) => update({ StartDate: v || null })}
              onClear={() => update({ StartDate: null })}
              disabled={!!readOnly}
            />
            <DateField
              label="Valid To"
              value={validityEnd}
              onChange={(v) => update({ EndDate: v || null })}
              onClear={() => update({ EndDate: null })}
              disabled={!!readOnly}
              // Browser calendars (Chrome/Edge) gray out earlier days
              // when `min` is set, paired with the parent's gate as
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
          <p className="text-[11px] text-muted">{helperText}</p>
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
  );
}
