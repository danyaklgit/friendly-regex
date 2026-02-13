import { useState, useMemo } from 'react';
import type { AttributeFormValue, TransactionRow } from '../../types';
import { Input } from '../shared/Input';
import { Select } from '../shared/Select';
import { Toggle } from '../shared/Toggle';
import { Button } from '../shared/Button';
import { Modal } from '../shared/Modal';
import { DATA_TYPE_OPTIONS } from '../../constants/fields';
import { useTransactionData } from '../../hooks/useTransactionData';
import { EXTRACTION_OPERATIONS } from '../../constants/operations';
import { generateExtractionPrompt, regexifyExtraction } from '../../utils/regexify';

interface AttributeEditorProps {
  attribute: AttributeFormValue;
  onUpdate: (updates: Partial<AttributeFormValue>) => void;
  onRemove: () => void;
  transactions?: TransactionRow[];
}

export function AttributeEditor({ attribute, onUpdate, onRemove, transactions }: AttributeEditorProps) {
  const { fieldMeta } = useTransactionData();
  const [showDistinct, setShowDistinct] = useState(false);
  const selectedOp = EXTRACTION_OPERATIONS.find((op) => op.key === attribute.extractionOperation);
  const preview = generateExtractionPrompt(attribute.extractionOperation, {
    prefix: attribute.prefix,
    suffix: attribute.suffix,
    pattern: attribute.pattern,
  });

  const distinctValues = useMemo(() => {
    if (!transactions || !selectedOp) return [];
    try {
      const regex = new RegExp(regexifyExtraction(attribute.extractionOperation, {
        prefix: attribute.prefix,
        suffix: attribute.suffix,
        pattern: attribute.pattern,
      }));
      const values = new Set<string>();
      for (const row of transactions) {
        const fieldValue = row[attribute.sourceField];
        if (fieldValue === undefined || fieldValue === null) continue;
        const match = String(fieldValue).match(regex);
        if (match?.[1]) values.add(match[1]);
      }
      return Array.from(values).sort();
    } catch {
      return [];
    }
  }, [transactions, attribute.sourceField, attribute.extractionOperation, attribute.prefix, attribute.suffix, attribute.pattern, selectedOp]);

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 grid grid-cols-3 gap-2">
          <Input
            placeholder="Attribute name"
            value={attribute.attributeTag}
            onChange={(e) => onUpdate({ attributeTag: e.target.value })}
          />
          {/* <Select
            value={attribute.dataType}
            onChange={(e) => onUpdate({ dataType: e.target.value as AttributeFormValue['dataType'] })}
            options={DATA_TYPE_OPTIONS.map((t) => ({ value: t, label: t }))}
          />
          <div className="flex items-center">
            <Toggle
              label="Required"
              checked={attribute.isMandatory}
              onChange={(checked) => onUpdate({ isMandatory: checked })}
            />
          </div> */}
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove} className="ml-2 text-red-400 hover:text-red-500">
          Remove Attribute
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select
          label="Source Field"
          value={attribute.sourceField}
          onChange={(e) => onUpdate({ sourceField: e.target.value })}
          options={fieldMeta.sourceFields.map((f) => ({ value: f, label: f }))}
        />
        <Select
          label="Extraction Method"
          value={attribute.extractionOperation}
          onChange={(e) => onUpdate({ extractionOperation: e.target.value as AttributeFormValue['extractionOperation'] })}
          options={EXTRACTION_OPERATIONS.map((op) => ({ value: op.key, label: op.label }))}
        />
      </div>

      {selectedOp && (
        <div className="grid grid-cols-2 gap-2">
          {selectedOp.fields.includes('prefix') && (
            <Input
              label="Prefix"
              placeholder="e.g., /ORDP/"
              value={attribute.prefix ?? ''}
              onChange={(e) => onUpdate({ prefix: e.target.value })}
            />
          )}
          {selectedOp.fields.includes('suffix') && (
            <Input
              label="Suffix"
              placeholder="e.g., /"
              value={attribute.suffix ?? ''}
              onChange={(e) => onUpdate({ suffix: e.target.value })}
            />
          )}
          {selectedOp.fields.includes('pattern') && (
            <Input
              label="Pattern"
              placeholder="e.g., \\d{4}"
              value={attribute.pattern ?? ''}
              onChange={(e) => onUpdate({ pattern: e.target.value })}
            />
          )}
        </div>
      )}

      <div className="flex items-center gap-2 justify-between">
        <p className="text-xs text-blue-500 italic">
          {attribute.sourceField} &rarr; <span className='text-orange-500'>{preview}</span>
        </p>
        {transactions && distinctValues.length > 0 && (
          <Button
            variant="ghost" className='!text-purple-500' size="sm"
            onClick={() => setShowDistinct(true)}            
          >
            See all distinct possible values ({distinctValues.length})
          </Button>
        )}
      </div>

      {showDistinct && (
        <Modal open onClose={() => setShowDistinct(false)} title={`Distinct values for "${attribute.attributeTag || 'Attribute'}"`}>
          <div className="space-y-1">
            {distinctValues.map((val, i) => (
              <div key={i} className="px-3 py-1.5 text-sm font-mono bg-gray-50 rounded border border-gray-200">
                {val}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
