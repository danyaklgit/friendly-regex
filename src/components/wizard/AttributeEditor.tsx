import { useState, useMemo } from 'react';
import type { AttributeFormValue, TransactionRow } from '../../types';
import { Input } from '../shared/Input';
import { Select } from '../shared/Select';
// import { Toggle } from '../shared/Toggle';
import { Button } from '../shared/Button';
import { Modal } from '../shared/Modal';
import { VALIDATION_RULE_TAG_OPTIONS } from '../../constants/fields';
import { useTransactionData } from '../../hooks/useTransactionData';
import { EXTRACTION_OPERATIONS, PREDEFINED_PATTERNS } from '../../constants/operations';
import { generateExtractionPrompt, regexifyExtraction } from '../../utils/regexify';
import { humanizeFieldName } from '../../utils/humanizeFieldName';

interface AttributeEditorProps {
  attribute: AttributeFormValue;
  onUpdate: (updates: Partial<AttributeFormValue>) => void;
  onRemove: () => void;
  transactions?: TransactionRow[];
  startCollapsed?: boolean;
}

export function AttributeEditor({ attribute, onUpdate, onRemove, transactions, startCollapsed }: AttributeEditorProps) {
  const { fieldMeta } = useTransactionData();
  const [showDistinct, setShowDistinct] = useState(false);
  const [editing, setEditing] = useState(!startCollapsed);

  const selectedOp = EXTRACTION_OPERATIONS.find((op) => op.key === attribute.extractionOperation);
  const preview = generateExtractionPrompt(attribute.extractionOperation, {
    prefix: attribute.prefix,
    suffix: attribute.suffix,
    pattern: attribute.pattern,
    verifyValue: attribute.verifyValue,
  });

  const distinctValues = useMemo(() => {
    if (!transactions || !selectedOp) return [];
    try {
      const regex = new RegExp(regexifyExtraction(attribute.extractionOperation, {
        prefix: attribute.prefix,
        suffix: attribute.suffix,
        pattern: attribute.pattern,
        verifyValue: attribute.verifyValue,
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
  }, [transactions, attribute.sourceField, attribute.extractionOperation, attribute.prefix, attribute.suffix, attribute.pattern, attribute.verifyValue, selectedOp]);

  // For predefined patterns with validate: true or extract_between_and_verify, check if all rows pass
  const validationSummary = useMemo(() => {
    if (!transactions) return null;

    // Handle extract_between_and_verify
    if (attribute.extractionOperation === 'extract_between_and_verify' && attribute.verifyValue) {
      try {
        const regex = new RegExp(regexifyExtraction(attribute.extractionOperation, {
          prefix: attribute.prefix,
          suffix: attribute.suffix,
          verifyValue: attribute.verifyValue,
        }));
        let total = 0;
        let passed = 0;
        let notPassed = 0;
        for (const row of transactions) {
          const fieldValue = row[attribute.sourceField];
          if (fieldValue === undefined || fieldValue === null) continue;
          total++;
          const match = String(fieldValue).match(regex);
          if (match?.[1] === attribute.verifyValue) {
            passed++
          } else {
            notPassed++
          };
        }
        if (total === 0) return null;
        return { allValid: passed === total, passed, total, notPassed };
      } catch {
        return null;
      }
    }

    // Handle predefined patterns
    if (!attribute.extractionOperation.startsWith('predefined:')) return null;
    const predefined = PREDEFINED_PATTERNS.find((p) => p.key === attribute.extractionOperation);
    if (!predefined?.validate) return null;
    try {
      const regex = new RegExp(predefined.regex);
      let total = 0;
      let passed = 0;
      for (const row of transactions) {
        const fieldValue = row[attribute.sourceField];
        if (fieldValue === undefined || fieldValue === null) continue;
        total++;
        if (regex.test(String(fieldValue))) passed++;
      }
      if (total === 0) return null;
      return { allValid: passed === total, passed, total };
    } catch {
      return null;
    }
  }, [transactions, attribute.sourceField, attribute.extractionOperation, attribute.prefix, attribute.suffix, attribute.verifyValue]);

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-3">
      {editing ? (
        <>
          <div className="flex items-start justify-between">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <Input
                placeholder="Attribute name"
                value={attribute.attributeTag}
                onChange={(e) => onUpdate({ attributeTag: e.target.value })}
              />
              <Select
                value={attribute.validationRuleTag}
                onChange={(e) => onUpdate({ validationRuleTag: e.target.value as AttributeFormValue['validationRuleTag'] })}
                options={VALIDATION_RULE_TAG_OPTIONS.map((t) => ({ value: t, label: t }))}
              />
            </div>


            <Button variant="ghost" size="sm" onClick={onRemove} className="ml-2 text-red-400 hover:text-red-500">
              Remove Attribute
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2" id="attribute_edit_1">
            <Select
              label="Source Field"
              value={attribute.sourceField}
              onChange={(e) => onUpdate({ sourceField: e.target.value })}
              options={fieldMeta.sourceFields.map((f) => ({ value: f, label: humanizeFieldName(f) }))}
            />
            <Select
              label="Extraction Method"
              value={attribute.extractionOperation}
              onChange={(e) => onUpdate({ extractionOperation: e.target.value as AttributeFormValue['extractionOperation'] })}
              options={EXTRACTION_OPERATIONS.map((op) => ({ value: op.key, label: op.label }))}
            />
          </div>

          {selectedOp && (
            <div className="grid grid-cols-2 gap-2" id="attribute_edit_2">
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
              {selectedOp.fields.includes('verifyValue') && (
                <Input
                  label="Verify Value"
                  placeholder="Expected extracted value"
                  value={attribute.verifyValue ?? ''}
                  onChange={(e) => onUpdate({ verifyValue: e.target.value })}
                />
              )}
            </div>
          )}

          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs text-blue-500 italic border-dashed border w-fit px-2 py-1">
                {humanizeFieldName(attribute.sourceField)} &rarr; <span className='text-orange-500'>{preview}</span>
              </p>
              {attribute.attributeTag.trim().length > 0 && (
                <Button variant="primary" size="sm" onClick={() => setEditing(false)}>
                  Save
                </Button>
              )}
            </div>
            {validationSummary && (
              <span className={`text-xs font-medium flex gap-2 mx-2`}>
                {validationSummary.passed > 0 && <span className='text-emerald-600'>{'\u2713'} {validationSummary.passed}</span>}
                {(validationSummary.notPassed || 0) > 0 && <span className='text-red-600'>{'\u2717'} {validationSummary.notPassed}</span>}
              </span>
            )}
            {transactions && distinctValues.length > 0 && (
              <Button
                variant="ghost" className='!text-purple-500' size="sm"
                onClick={() => setShowDistinct(true)}
              >
                See all distinct values ({distinctValues.length})
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between">
          <div
            className="flex-1 cursor-pointer hover:bg-gray-50 rounded px-2 py-1.5 transition-colors"
            onClick={() => setEditing(true)}
          >
            <p className="text-xs">
              <span className="font-medium text-indigo-700">{attribute.attributeTag}</span>
              <span className="text-gray-400 mx-1.5">&mdash;</span>
              <span className="text-blue-500 italic">
                {humanizeFieldName(attribute.sourceField)} &rarr; <span className='text-orange-500'>{preview}</span>
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1">
             {validationSummary && (
              <span className={`text-xs font-medium flex gap-2 mx-2`}>
                {validationSummary.passed > 0 && <span className='text-emerald-600'>{'\u2713'} {validationSummary.passed}</span>}
                {(validationSummary.notPassed || 0) > 0 && <span className='text-red-600'>{'\u2717'} {validationSummary.notPassed}</span>}
              </span>
            )}
            {transactions && distinctValues.length > 0 && (
              <Button
                variant="ghost" className='!text-purple-500' size="sm"
                onClick={() => setShowDistinct(true)}
              >
                See all distinct values ({distinctValues.length})
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onRemove} className="ml-1 text-red-400 hover:text-red-500">
              Remove
            </Button>
          </div>
        </div>
      )}

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
