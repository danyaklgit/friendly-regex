import type { AttributeFormValue } from '../../types';
import { Input } from '../shared/Input';
import { Select } from '../shared/Select';
import { Toggle } from '../shared/Toggle';
import { Button } from '../shared/Button';
import { SOURCE_FIELDS } from '../../constants/fields';
import { DATA_TYPE_OPTIONS } from '../../constants/fields';
import { EXTRACTION_OPERATIONS } from '../../constants/operations';
import { generateExtractionPrompt } from '../../utils/regexify';

interface AttributeEditorProps {
  attribute: AttributeFormValue;
  onUpdate: (updates: Partial<AttributeFormValue>) => void;
  onRemove: () => void;
}

export function AttributeEditor({ attribute, onUpdate, onRemove }: AttributeEditorProps) {
  const selectedOp = EXTRACTION_OPERATIONS.find((op) => op.key === attribute.extractionOperation);
  const preview = generateExtractionPrompt(attribute.extractionOperation, {
    prefix: attribute.prefix,
    suffix: attribute.suffix,
    pattern: attribute.pattern,
  });

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 grid grid-cols-3 gap-2">
          <Input
            placeholder="Attribute name"
            value={attribute.attributeTag}
            onChange={(e) => onUpdate({ attributeTag: e.target.value })}
          />
          <Select
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
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove} className="ml-2 text-red-400 hover:text-red-500">
          Remove Attribute
          {/* <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg> */}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select
          label="Source Field"
          value={attribute.sourceField}
          onChange={(e) => onUpdate({ sourceField: e.target.value })}
          options={SOURCE_FIELDS.map((f) => ({ value: f, label: f }))}
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

      <p className="text-xs text-blue-500 italic">
        {attribute.sourceField} &rarr; <span className='text-orange-500'>{preview}</span>
      </p>
    </div>
  );
}
