import { useState, useMemo } from 'react';
import type { ConditionFormValue } from '../../types';
import { Select } from '../shared/Select';
import { Input } from '../shared/Input';
import { Button } from '../shared/Button';
import { MATCH_OPERATIONS } from '../../constants/operations';
import { useTransactionData } from '../../hooks/useTransactionData';
import { generateExpressionPrompt } from '../../utils/regexify';
import { humanizeFieldName } from '../../utils/humanizeFieldName';

interface ConditionEditorProps {
  condition: ConditionFormValue;
  onUpdate: (updates: Partial<ConditionFormValue>) => void;
  onRemove: () => void;
  canRemove: boolean;
  showAnd?: boolean;
}

export function ConditionEditor({
  condition,
  onUpdate,
  onRemove,
  canRemove,
  showAnd,
}: ConditionEditorProps) {
  const { fieldMeta, transactions } = useTransactionData();
  const [editing, setEditing] = useState(true);

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
    ? generateExpressionPrompt(condition.operation, condition.value, condition.values, {
      prefix: condition.prefix,
      suffix: condition.suffix,
    })
    : '';

  return (
    <div>
      {showAnd && (
        <div className="flex items-center justify-start my-2 px-3">
          <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border-dashed border w-fit px-2 py-1">
            AND
          </span>
        </div>
      )}
      <div className="flex items-end gap-2 p-1 bg-gray-50 rounded-lg border border-gray-200">
        {editing ? (
          <div className={`flex-1 grid gap-2 grid-cols-3`} id='edit_mode_fields'>
            <Select
              label='Source Field'
              value={condition.sourceField}
              onChange={(e) => {
                const newField = e.target.value;
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
              options={fieldMeta.sourceFields.map((f) => ({ value: f, label: humanizeFieldName(f) }))}
            />
            <Select
              label='Operation'
              value={condition.operation}
              onChange={(e) => onUpdate({ operation: e.target.value as ConditionFormValue['operation'] })}
              options={availableOperations.map((op) => ({ value: op.key, label: op.label }))}
            />
            {selectedOp?.requiresMultipleValues ? (
              <Input
                label='Value'
                placeholder="Value1, Value2, ..."
                value={(condition.values ?? []).join(', ')}
                onChange={(e) => {
                  const values = e.target.value.split(',').map((v) => v.trim()).filter(Boolean);
                  onUpdate({ values, value: values[0] ?? '' });
                }}
              />
            ) : selectedOp?.requiresExtraction ? (
              <div className='flex flex-col gap-1'>
                <Input
                  label='Starting Character'
                  placeholder="Prefix..."
                  value={condition.prefix ?? ''}
                  onChange={(e) => onUpdate({ prefix: e.target.value })}
                />
                <Input
                  label='End Character'
                  placeholder="Suffix..."
                  value={condition.suffix ?? ''}
                  onChange={(e) => onUpdate({ suffix: e.target.value })}
                />
                <Input
                  label='Compare value to'
                  placeholder="Equals value..."
                  value={condition.value}
                  onChange={(e) => onUpdate({ value: e.target.value })}
                />
              </div>
            ) : (
              <Input
                label='Value'
                placeholder="Enter value..."
                value={condition.value}
                onChange={(e) => onUpdate({ value: e.target.value })}
              />
            )}
          </div>
        ) : (
          <div
            className="flex-1 cursor-pointer hover:bg-gray-100 rounded px-2 py-1.5 transition-colors"
            onClick={() => setEditing(true)}
          >
            <p className="text-xs text-blue-500 italic">
              {humanizeFieldName(condition.sourceField)} &rarr; <span className='text-orange-500'>{preview}</span>
            </p>
          </div>
        )}
        {canRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove} className=" text-gray-400 hover:text-red-500">
            Remove Condition
          </Button>
        )}
      </div>
      {editing && preview && (
        <div className="mt-1 ml-3 flex items-center gap-2">
          <p className="text-xs text-blue-500 italic text-left border-dashed border w-fit px-2 py-1">
            {humanizeFieldName(condition.sourceField)} &rarr; <span className='text-orange-500'>{preview}</span>
          </p>
          <Button variant="primary" size="sm" onClick={() => setEditing(false)}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
