import { useState, useMemo, useCallback, useEffect } from 'react';
import type { ConditionFormValue } from '../../types';
import { SearchableSelect } from '../shared/SearchableSelect';
import { Input } from '../shared/Input';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';
import { MATCH_OPERATIONS } from '../../constants/operations';
import { DATE_SOURCE_FIELDS } from '../../constants/fields';
import { useTransactionData } from '../../hooks/useTransactionData';
import { generateExpressionPrompt } from '../../utils/regexify';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { CommentIconButton } from '../comments/CommentIconButton';

const ALLOWED_SOURCE_FIELDS = new Set([
  'AdditionalInformation', 'Amount', 'BankReference', 'CurrencyCode',
  'Description1', 'Description2', 'EntryDate', 'FundsCode',
  'IBAN', 'StatementDate', 'TransactionDetails', 'TransactionStatusIndicator',
  'ValueDate',
]);

// Date/numeric source fields surface a restricted operation set: only Equals
// / Does not equal / Greater than / Less than. Anything not listed here
// falls into the "text" bucket and gets the full operation list.
const NUMERIC_SOURCE_FIELDS = new Set(['Amount']);
// The 4 operations valid for date and numeric fields.
const ORDERED_NUMERIC_DATE_OPS = new Set<string>([
  'equals',
  'does_not_equal',
  'greater_than',
  'less_than',
]);

interface ConditionEditorProps {
  condition: ConditionFormValue;
  onUpdate: (updates: Partial<ConditionFormValue>) => void;
  onRemove: () => void;
  onSave?: () => void;
  canRemove: boolean;
  showAnd?: boolean;
  startCollapsed?: boolean;
  readOnly?: boolean;
  /** True only when this condition matches an EARLIER sibling in the same
   *  rule set — so the first occurrence stays clean and only the duplicate
   *  copy is flagged. */
  isWithinGroupDuplicate?: boolean;
  /** True when the rule set as a whole is a duplicate of another rule set.
   *  Drives the Save gate (the persistent banner lives on the group). */
  isGroupDuplicate?: boolean;
  /** Comment scope — passed in from the editor that knows the library + def. */
  libraryId?: string;
  definitionId?: string;
}


export function ConditionEditor({
  condition,
  onUpdate,
  onRemove,
  onSave,
  canRemove,
  showAnd,
  startCollapsed,
  readOnly,
  isWithinGroupDuplicate,
  isGroupDuplicate,
  libraryId,
  definitionId,
}: ConditionEditorProps) {
  const { fieldMeta, transactions } = useTransactionData();
  const [editing, setEditing] = useState(
    !startCollapsed && condition.value.trim().length === 0,
  );
  const [snapshot, setSnapshot] = useState<ConditionFormValue | null>(() =>
    !startCollapsed ? { ...condition } : null
  );

  const hasChanges = useMemo(() => {
    if (!snapshot) return false;
    return (
      condition.sourceField !== snapshot.sourceField ||
      condition.operation !== snapshot.operation ||
      condition.value !== snapshot.value ||
      (condition.values ?? []).join(',') !== (snapshot.values ?? []).join(',') ||
      (condition.prefix ?? '') !== (snapshot.prefix ?? '') ||
      (condition.suffix ?? '') !== (snapshot.suffix ?? '')
    );
  }, [condition, snapshot]);

  const handleDiscard = useCallback(() => {
    if (snapshot) {
      // onUpdate is a partial-merge in the parent reducer. The snapshot for a
      // freshly added condition doesn't carry the optional transient fields
      // (values / prefix / suffix), so spreading the snapshot would leave a
      // stale array behind — e.g. a discarded "Matches one of" run keeps
      // condition.values, then bleeds into the next source field's input.
      // Including them explicitly forces the merge to overwrite to undefined.
      onUpdate({
        sourceField: snapshot.sourceField,
        operation: snapshot.operation,
        value: snapshot.value,
        values: snapshot.values,
        prefix: snapshot.prefix,
        suffix: snapshot.suffix,
      });
      setSnapshot({ ...snapshot });
    }
  }, [snapshot, onUpdate]);

  // Field kind drives the available operations. Date and numeric fields share
  // the same restricted set (Equals / Does not equal / Greater than / Less
  // than) — string-shaped ops like Contains or Starts with don't make sense
  // for dates or numbers and would compile to regex that doesn't behave
  // numerically server-side. Falls back to the heuristic (all values parse
  // as numbers) when the column name isn't on the explicit numeric list, so
  // future numeric columns work without a code change.
  const fieldKind = useMemo<'date' | 'numeric' | 'text'>(() => {
    const f = condition.sourceField;
    if (!f) return 'text';
    if (DATE_SOURCE_FIELDS.has(f)) return 'date';
    if (NUMERIC_SOURCE_FIELDS.has(f)) return 'numeric';
    if (transactions.length > 0) {
      const allNumeric = transactions.every((row) => {
        const val = row[f];
        if (val === null || val === undefined || val === '') return true;
        return !isNaN(Number(val));
      });
      if (allNumeric) return 'numeric';
    }
    return 'text';
  }, [condition.sourceField, transactions]);

  const availableOperations = useMemo(() => {
    if (fieldKind === 'date' || fieldKind === 'numeric') {
      return MATCH_OPERATIONS.filter((op) => ORDERED_NUMERIC_DATE_OPS.has(op.key));
    }
    return MATCH_OPERATIONS.filter((op) => !op.isNumeric);
  }, [fieldKind]);

  const selectedOp = MATCH_OPERATIONS.find((op) => op.key === condition.operation);
  // Clamp user-supplied strings before building the inline preview so a single
  // long value doesn't dominate the row's truncation budget. The full value
  // still feeds the regex pipeline — this only affects the human-readable
  // summary that sits next to the source field name.
  const PREVIEW_CLAMP = 40;
  const clampForPreview = (s: string | undefined): string | undefined =>
    s && s.length > PREVIEW_CLAMP ? s.slice(0, PREVIEW_CLAMP - 1) + '…' : s;
  const preview = condition.value
    ? generateExpressionPrompt(
        condition.operation,
        clampForPreview(condition.value) ?? '',
        condition.values?.map((v) => clampForPreview(v) ?? ''),
      )
    : '';

  // Required-field check for the inline Save button. Mirrors
  // `isCompleteCondition` (utils/ruleFingerprint) but tailored to surface the
  // *specific* missing fields in the tooltip so the user knows what to fill.
  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!condition.sourceField || condition.sourceField.trim().length === 0) {
      missing.push('Source Field');
    }
    if (!condition.operation || (condition.operation as string).trim().length === 0) {
      missing.push('Operation');
    }
    if (selectedOp?.requiresMultipleValues) {
      if (!condition.values || !condition.values.some((v) => v.trim().length > 0)) {
        missing.push('Value');
      }
    } else if (!condition.value || condition.value.trim().length === 0) {
      missing.push('Value');
    }
    return missing;
  }, [condition.sourceField, condition.operation, condition.value, condition.values, selectedOp]);
  const isIncomplete = missingFields.length > 0;

  // Duplicate signals come from the parent (RuleGroupEditor / StepRuleExpressions)
  // which has full visibility of every rule set. Within-group duplicates flag
  // only the LATER copy so the original stays clean; the whole-group duplicate
  // is surfaced by a persistent banner on the rule set itself but we still
  // gate Save here so an in-flight edit cannot bypass it.
  const isDuplicate = !!isWithinGroupDuplicate || !!isGroupDuplicate;
  const duplicateMessage = isWithinGroupDuplicate
    ? 'This condition already exists in this rule set.'
    : 'Another rule set already has the exact same conditions.';

  // Local mirror of the multi-value input. The parsed `condition.values` strips
  // empty tokens (so a trailing comma "2023-04-01," produces ["2023-04-01"]),
  // which previously fed back into the controlled input and erased the comma
  // the user just typed. Keeping a separate string lets the user type freely;
  // we only resync when the canonical join of condition.values diverges from
  // the join of our parsed input (i.e. an external reset such as Discard).
  const [valuesInput, setValuesInput] = useState(() => (condition.values ?? []).join(', '));
  useEffect(() => {
    const fromValues = (condition.values ?? []).join(', ');
    const parsedFromInput = valuesInput.split(',').map((v) => v.trim()).filter(Boolean).join(', ');
    if (fromValues !== parsedFromInput) {
      setValuesInput(fromValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condition.values]);

  return (
    <div>
      {showAnd && (
        <div className="flex items-center justify-start my-1 px-2">
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded border-dashed border w-fit">
            AND
          </span>
        </div>
      )}
      <div className="flex items-end gap-2 p-1 bg-surface-secondary rounded-lg border border-border">
        {editing ? (
          <div data-tour="condition-fields" className={`flex-1 grid gap-2 grid-cols-3`} id='edit_mode_fields'>
            <div data-tour="condition-source-field">
              <SearchableSelect
                label='Source Field'
                placeholder='Select source field'
                value={condition.sourceField}
                disabled={readOnly}
                onChange={(newField) => {
                  const updates: Partial<ConditionFormValue> = { sourceField: newField };
                  // Recompute the new field's kind so we can clear any
                  // operation that won't be valid on it (text-only ops on a
                  // date/numeric field, or a numeric op on a text field).
                  const newKind: 'date' | 'numeric' | 'text' = DATE_SOURCE_FIELDS.has(newField)
                    ? 'date'
                    : NUMERIC_SOURCE_FIELDS.has(newField)
                      ? 'numeric'
                      : transactions.length > 0 && transactions.every((row) => {
                          const val = row[newField];
                          if (val === null || val === undefined || val === '') return true;
                          return !isNaN(Number(val));
                        })
                        ? 'numeric'
                        : 'text';
                  const allowed = newKind === 'text'
                    ? new Set(MATCH_OPERATIONS.filter((op) => !op.isNumeric).map((op) => op.key))
                    : ORDERED_NUMERIC_DATE_OPS;
                  if (condition.operation && !allowed.has(condition.operation)) {
                    updates.operation = '' as ConditionFormValue['operation'];
                    updates.value = '';
                    updates.values = undefined;
                  } else if (newKind !== fieldKind && condition.value) {
                    // Operation survives (equals/does_not_equal work for all
                    // kinds) but the previously typed value won't render in
                    // the new input — a date input rejects "ACME", a number
                    // input strips it. Clear so the user re-enters.
                    updates.value = '';
                    updates.values = undefined;
                  }
                  onUpdate(updates);
                }}
                options={fieldMeta.sourceFields.filter((f) => ALLOWED_SOURCE_FIELDS.has(f)).map((f) => ({ value: f, label: humanizeFieldName(f) })).sort((a, b) => a.label.localeCompare(b.label))}
              />
            </div>
            <div data-tour="condition-operation">
              <SearchableSelect
                label='Operation'
                placeholder='Select operation'
                value={condition.operation}
                disabled={readOnly}
                onChange={(val) => onUpdate({ operation: val as ConditionFormValue['operation'] })}
                options={availableOperations.map((op) => ({ value: op.key, label: op.label }))}
              />
            </div>
            <div data-tour="condition-value">
              {selectedOp?.requiresMultipleValues ? (
                <Input
                  label='Value'
                  placeholder="Value1, Value2, ..."
                  value={valuesInput}
                  disabled={readOnly}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setValuesInput(raw);
                    const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
                    onUpdate({ values, value: values[0] ?? '' });
                  }}
                />
              ) : fieldKind === 'date' ? (
                <Input
                  label='Value'
                  type="date"
                  value={condition.value}
                  disabled={readOnly}
                  onChange={(e) => onUpdate({ value: e.target.value })}
                />
              ) : fieldKind === 'numeric' ? (
                <Input
                  label='Value'
                  // `type=text` (not `number`) avoids the native up/down
                  // spinners while the onChange filter below restricts the
                  // input to a signed decimal (digits + optional minus +
                  // at most one period). `inputMode=decimal` surfaces the
                  // numeric-with-decimal keypad on mobile.
                  type="text"
                  inputMode="decimal"
                  placeholder="Enter number..."
                  value={condition.value}
                  disabled={readOnly}
                  onChange={(e) => {
                    // Strip everything except digits, `-`, and `.`, force `-`
                    // to be leading-only, then collapse repeat `.` so only the
                    // first survives.
                    let cleaned = e.target.value
                      .replace(/[^\d.-]/g, '')
                      .replace(/(?!^)-/g, '');
                    const firstDot = cleaned.indexOf('.');
                    if (firstDot !== -1) {
                      cleaned = cleaned.slice(0, firstDot + 1)
                        + cleaned.slice(firstDot + 1).replace(/\./g, '');
                    }
                    onUpdate({ value: cleaned });
                  }}
                />
              ) : (
                <Input
                  label='Value'
                  placeholder="Enter value..."
                  value={condition.value}
                  disabled={readOnly}
                  onChange={(e) => onUpdate({ value: e.target.value })}
                />
              )}
            </div>
          </div>
        ) : (
          <div
            className="flex-1 min-w-0 cursor-pointer hover:bg-surface-active rounded px-2 py-1.5 transition-colors"
            onClick={() => { setSnapshot({ ...condition }); setEditing(true); }}
          >
            <p className="text-xs text-primary italic truncate">
              {humanizeFieldName(condition.sourceField)} &rarr; <span className='text-orange-500 dark:text-orange-300'>{preview}</span>
            </p>
          </div>
        )}
        {libraryId && definitionId && condition._expressionId && (
          <span className="self-center">
            <CommentIconButton
              target={{
                TagSpecLibraryId: libraryId,
                TagSpecDefinitionId: definitionId,
                TagRuleExpressionId: condition._expressionId,
              }}
              targetLabel={humanizeFieldName(condition.sourceField)}
              size="xs"
            />
          </span>
        )}
        {canRemove && !readOnly && (
          <Button variant="ghost" size="xs" onClick={onRemove} className=" text-faint hover:text-red-500">
            Remove Condition
          </Button>
        )}
      </div>
      {editing && (
        <div className="mt-1 ml-3 flex flex-wrap items-center gap-2">
          {preview && (
            <p className="text-xs text-primary italic text-left border-dashed border w-fit max-w-full px-2 py-1 break-all">
              {humanizeFieldName(condition.sourceField)} &rarr; <span className='text-orange-500 dark:text-orange-300'>{preview}</span>
            </p>
          )}
          {isDuplicate && (
            <p
              role="alert"
              className="text-xs text-red-600 dark:text-rose-300 inline-flex items-center gap-1.5"
            >
              <span aria-hidden="true" className="font-bold leading-none">!</span>
              <span>{duplicateMessage}</span>
            </p>
          )}
          {!readOnly && (
            <>
              {hasChanges && (
                <Button variant="secondary" size="xs" onClick={handleDiscard} className="min-w-16 text-center">
                  Discard
                </Button>
              )}
              {(isDuplicate || isIncomplete) ? (
                // Duplicate takes precedence in the tooltip; both block Save.
                <Tooltip
                  placement="top"
                  content={
                    isDuplicate
                      ? duplicateMessage
                      : `Missing: ${missingFields.join(', ')}`
                  }
                >
                  <span>
                    <Button
                      data-tour="condition-save-button"
                      variant="primary"
                      size="xs"
                      disabled
                      className="min-w-16 text-center"
                    >
                      Save
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <Button
                  data-tour="condition-save-button"
                  variant="primary"
                  size="xs"
                  onClick={() => { setEditing(false); onSave?.(); }}
                  className="min-w-16 text-center"
                >
                  Save
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
