import { useState, useMemo, useCallback } from 'react';
import type { ConditionFormValue } from '../../types';
import { SearchableSelect } from '../shared/SearchableSelect';
import { Input } from '../shared/Input';
import { Button } from '../shared/Button';
import { MATCH_OPERATIONS } from '../../constants/operations';
import { useTransactionData } from '../../hooks/useTransactionData';
import { generateExpressionPrompt } from '../../utils/regexify';
import { humanizeFieldName } from '../../utils/humanizeFieldName';

const ALLOWED_SOURCE_FIELDS = new Set([
  'AdditionalInformation', 'Amount', 'BankReference', 'CurrencyCode',
  'Description1', 'Description2', 'EntryDate', 'FundsCode',
  'IBAN', 'StatementDate', 'TransactionDetails', 'TransactionStatusIndicator',
  'ValueDate',
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
}: ConditionEditorProps) {
  const { fieldMeta, transactions } = useTransactionData();
  const [editing, setEditing] = useState(!startCollapsed);
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
      onUpdate(snapshot);
      setSnapshot({ ...snapshot });
    }
  }, [snapshot, onUpdate]);

  const isFieldNumeric = useMemo(() => {
    if (!condition.sourceField || transactions.length === 0) return false;
    return transactions.every((row) => {
      const val = row[condition.sourceField];
      if (val === null || val === undefined || val === '') return true;
      return !isNaN(Number(val));
    });
  }, [condition.sourceField, transactions]);

  const availableOperations = useMemo(() => {
    if (isFieldNumeric) return MATCH_OPERATIONS;
    return MATCH_OPERATIONS.filter((op) => !op.isNumeric);
  }, [isFieldNumeric]);

  const selectedOp = MATCH_OPERATIONS.find((op) => op.key === condition.operation);
  const preview = condition.value
    ? generateExpressionPrompt(condition.operation, condition.value, condition.values)
    : '';

  return (
    <div>
      {showAnd && (
        <div className="flex items-center justify-start my-1 px-2">
          <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border-dashed border w-fit">
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
                  const currentOp = MATCH_OPERATIONS.find((op) => op.key === condition.operation);
                  if (currentOp?.isNumeric) {
                    const newFieldNumeric = transactions.every((row) => {
                      const val = row[newField];
                      if (val === null || val === undefined || val === '') return true;
                      return !isNaN(Number(val));
                    });
                    if (!newFieldNumeric) {
                      updates.operation = 'begins_with';
                    }
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
                  value={(condition.values ?? []).join(', ')}
                  disabled={readOnly}
                  onChange={(e) => {
                    const values = e.target.value.split(',').map((v) => v.trim()).filter(Boolean);
                    onUpdate({ values, value: values[0] ?? '' });
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
            className="flex-1 cursor-pointer hover:bg-surface-active rounded px-2 py-1.5 transition-colors"
            onClick={() => { setSnapshot({ ...condition }); setEditing(true); }}
          >
            <p className="text-xs text-primary italic">
              {humanizeFieldName(condition.sourceField)} &rarr; <span className='text-orange-500'>{preview}</span>
            </p>
          </div>
        )}
        {canRemove && !readOnly && (
          <Button variant="ghost" size="xs" onClick={onRemove} className=" text-faint hover:text-red-500">
            Remove Condition
          </Button>
        )}
      </div>
      {editing && preview && (
        <div className="mt-1 ml-3 flex items-center gap-2">
          <p className="text-xs text-primary italic text-left border-dashed border w-fit px-2 py-1">
            {humanizeFieldName(condition.sourceField)} &rarr; <span className='text-orange-500'>{preview}</span>
          </p>
          {!readOnly && (
            <>
              {hasChanges && (
                <Button variant="secondary" size="xs" onClick={handleDiscard} className="min-w-16 text-center">
                  Discard
                </Button>
              )}
              <Button data-tour="condition-save-button" variant="primary" size="xs" onClick={() => { setEditing(false); onSave?.(); }} className="min-w-16 text-center">
                Save
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
