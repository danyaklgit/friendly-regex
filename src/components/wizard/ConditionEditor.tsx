import type { ConditionFormValue } from '../../types';
import { Select } from '../shared/Select';
import { Input } from '../shared/Input';
import { Button } from '../shared/Button';
import { SOURCE_FIELDS } from '../../constants/fields';
import { MATCH_OPERATIONS } from '../../constants/operations';
import { generateExpressionPrompt } from '../../utils/regexify';

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
  const selectedOp = MATCH_OPERATIONS.find((op) => op.key === condition.operation);
  const preview = condition.value
    ? generateExpressionPrompt(condition.operation, condition.value, condition.values)
    : '';

  return (
    <div>
      {showAnd && (
        <div className="flex items-center justify-center my-2">
          <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
            AND
          </span>
        </div>
      )}
      <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex-1 grid grid-cols-3 gap-2">
          <Select
            value={condition.sourceField}
            onChange={(e) => onUpdate({ sourceField: e.target.value })}
            options={SOURCE_FIELDS.map((f) => ({ value: f, label: f }))}
          />
          <Select
            value={condition.operation}
            onChange={(e) => onUpdate({ operation: e.target.value as ConditionFormValue['operation'] })}
            options={MATCH_OPERATIONS.map((op) => ({ value: op.key, label: op.label }))}
          />
          {selectedOp?.requiresMultipleValues ? (
            <Input
              placeholder="Value1, Value2, ..."
              value={(condition.values ?? []).join(', ')}
              onChange={(e) => {
                const values = e.target.value.split(',').map((v) => v.trim()).filter(Boolean);
                onUpdate({ values, value: values[0] ?? '' });
              }}
            />
          ) : (
            <Input
              placeholder="Enter value..."
              value={condition.value}
              onChange={(e) => onUpdate({ value: e.target.value })}
            />
          )}
        </div>
        {canRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove} className="mt-0.5 text-gray-400 hover:text-red-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        )}
      </div>
      {preview && (
        <p className="mt-1 ml-3 text-xs text-gray-500 italic">
          {condition.sourceField} {preview}
        </p>
      )}
    </div>
  );
}
