import { useState, useMemo, useCallback } from 'react';
import type { AttributeFormValue, TransactionRow } from '../../types';
import { Input } from '../shared/Input';
import { SearchableSelect } from '../shared/SearchableSelect';
import { Toggle } from '../shared/Toggle';
import { Button } from '../shared/Button';
import { Modal } from '../shared/Modal';
import { VALIDATION_RULE_TAG_OPTIONS } from '../../constants/fields';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useTransactionData } from '../../hooks/useTransactionData';
import { EXTRACTION_OPERATIONS, PREDEFINED_PATTERNS } from '../../constants/operations';
import { generateExtractionPrompt, regexifyExtraction } from '../../utils/regexify';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { AttributeFormModal } from '../attributes/AttributeFormModal';

const ALLOWED_SOURCE_FIELDS = new Set([
  'IBAN', 'EntryDate', 'BankReference', 'Description1', 'Description2',
  'AdditionalInformation', 'StatementDate', 'TransactionDetails', 'ValueDate',
  'FundsCode', 'TransactionStatusIndicator', 'CurrencyCode', 'Amount',
]);

const FILTERED_EXTRACTION_OPERATIONS = EXTRACTION_OPERATIONS.filter(
  (op) => op.key !== 'predefined:ksa_iban' && op.key !== 'extract_between_and_verify'
);

interface AttributeEditorProps {
  attribute: AttributeFormValue;
  onUpdate: (updates: Partial<AttributeFormValue>) => void;
  onRemove: () => void;
  transactions?: TransactionRow[];
  startCollapsed?: boolean;
}

export function AttributeEditor({ attribute, onUpdate, onRemove, transactions, startCollapsed }: AttributeEditorProps) {
  const { fieldMeta } = useTransactionData();
  const { activeAttributes, validationClasses, validationOptions, lovOptions, lovLookup, createNewAttribute } = useLovAttributes();
  const [showDistinct, setShowDistinct] = useState(false);
  const [editing, setEditing] = useState(!startCollapsed);
  const [createAttrOpen, setCreateAttrOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<AttributeFormValue | null>(() =>
    !startCollapsed ? { ...attribute } : null
  );

  // Build attribute name options from backend attributes
  const attributeNameOptions = useMemo(() =>
    activeAttributes.map((a) => ({
      value: a.Value,
      label: a.Details.find((d) => d.LanguageCode === 'en')?.Name ?? a.Value,
      sublabel: a.PossibleLOVTag ? `Suggested LOV: ${a.PossibleLOVTag}` : undefined,
    })),
  [activeAttributes]);

  // Use dynamic validation options, fall back to hardcoded
  const validationRuleOptions = useMemo(() =>
    validationOptions.length > 0
      ? validationOptions
      : VALIDATION_RULE_TAG_OPTIONS.map((t) => ({ value: t, label: t })),
  [validationOptions]);

  const hasChanges = useMemo(() => {
    if (!snapshot) return false;
    return (
      attribute.attributeTag !== snapshot.attributeTag ||
      attribute.validationRuleTag !== snapshot.validationRuleTag ||
      attribute.isMandatory !== snapshot.isMandatory ||
      attribute.sourceField !== snapshot.sourceField ||
      attribute.extractionOperation !== snapshot.extractionOperation ||
      (attribute.prefix ?? '') !== (snapshot.prefix ?? '') ||
      (attribute.suffix ?? '') !== (snapshot.suffix ?? '') ||
      (attribute.pattern ?? '') !== (snapshot.pattern ?? '') ||
      (attribute.verifyValue ?? '') !== (snapshot.verifyValue ?? '') ||
      (attribute.lovTag ?? '') !== (snapshot.lovTag ?? '') ||
      (attribute.isLovBased ?? false) !== (snapshot.isLovBased ?? false) ||
      (attribute.numChars ?? 0) !== (snapshot.numChars ?? 0) ||
      (attribute.toStr ?? '') !== (snapshot.toStr ?? '') ||
      (attribute.occurrence ?? 0) !== (snapshot.occurrence ?? 0) ||
      (attribute.startingPosition ?? 0) !== (snapshot.startingPosition ?? 0) ||
      (attribute.fromPosition ?? 0) !== (snapshot.fromPosition ?? 0)
    );
  }, [attribute, snapshot]);

  const handleDiscard = useCallback(() => {
    if (snapshot) {
      onUpdate(snapshot);
      setSnapshot({ ...snapshot });
    }
  }, [snapshot, onUpdate]);

  const selectedOp = EXTRACTION_OPERATIONS.find((op) => op.key === attribute.extractionOperation);
  const filteredOp = FILTERED_EXTRACTION_OPERATIONS.find((op) => op.key === attribute.extractionOperation);
  const extractionParams = useMemo(() => ({
    prefix: attribute.prefix,
    suffix: attribute.suffix,
    pattern: attribute.pattern,
    verifyValue: attribute.verifyValue,
    numChars: attribute.numChars,
    toStr: attribute.toStr,
    occurrence: attribute.occurrence,
    startingPosition: attribute.startingPosition,
    fromPosition: attribute.fromPosition,
  }), [attribute.prefix, attribute.suffix, attribute.pattern, attribute.verifyValue, attribute.numChars, attribute.toStr, attribute.occurrence, attribute.startingPosition, attribute.fromPosition]);
  const preview = generateExtractionPrompt(attribute.extractionOperation, extractionParams);

  const distinctValues = useMemo(() => {
    if (!transactions || !selectedOp) return [];
    try {
      const regex = new RegExp(regexifyExtraction(attribute.extractionOperation, extractionParams));
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
  }, [transactions, attribute.sourceField, attribute.extractionOperation, attribute.prefix, attribute.suffix, attribute.pattern, attribute.verifyValue, selectedOp, extractionParams]);

  // For predefined patterns with validate: true or extract_between_and_verify, check if all rows pass
  const validationSummary = useMemo(() => {
    if (!transactions) return null;

    // Handle extract_between_and_verify
    if (attribute.extractionOperation === 'extract_between_and_verify' && attribute.verifyValue) {
      try {
        const regex = new RegExp(regexifyExtraction(attribute.extractionOperation, extractionParams));
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
    if (attribute.extractionOperation.startsWith('predefined:')) {
      const predefined = PREDEFINED_PATTERNS.find((p) => p.key === attribute.extractionOperation);
      if (predefined?.validate) {
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
          if (total > 0) return { allValid: passed === total, passed, total, notPassed: total - passed };
        } catch { /* skip */ }
      }
    }

    // Handle ValidationClass regex — validate extracted values against the class pattern
    const vc = validationClasses.find((c) => c.Tag === attribute.validationRuleTag);
    if (vc?.Regex && attribute.sourceField) {
      try {
        const extractionRegex = new RegExp(regexifyExtraction(attribute.extractionOperation, extractionParams));
        const vcRegex = new RegExp(vc.Regex);
        let total = 0;
        let passed = 0;
        for (const row of transactions) {
          const fieldValue = row[attribute.sourceField];
          if (fieldValue === undefined || fieldValue === null) continue;
          const match = String(fieldValue).match(extractionRegex);
          if (!match?.[1]) continue;
          total++;
          if (vcRegex.test(match[1])) passed++;
        }
        if (total > 0) return { allValid: passed === total, passed, total, notPassed: total - passed };
      } catch { /* skip */ }
    }

    return null;
  }, [transactions, attribute.sourceField, attribute.extractionOperation, attribute.prefix, attribute.suffix, attribute.verifyValue, attribute.validationRuleTag, validationClasses]);

  return (
    <div className="border border-border rounded-lg p-3 py-2 bg-surface space-y-3">
      {editing ? (
        <>
          <div className="flex justify-end">
            <Button variant="ghost" size="xs" onClick={onRemove} className="text-red-400 hover:text-red-500 shrink-0">
              Remove Attribute
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <SearchableSelect
              label="Attribute Name"
              value={attribute.attributeTag}
              onChange={(val) => {
                const backend = activeAttributes.find((a) => a.Value === val);
                const updates: Partial<AttributeFormValue> = { attributeTag: val };
                if (backend?.PossibleLOVTag) {
                  updates.isLovBased = true;
                  updates.lovTag = backend.PossibleLOVTag;
                }
                onUpdate(updates);
              }}
              options={attributeNameOptions}
              placeholder="Select attribute…"
              onCreateNew={() => setCreateAttrOpen(true)}
              createNewLabel="+ Create New Attribute"
            />
            <SearchableSelect
              label="Validation Class"
              placeholder="Select validation class"
              value={attribute.validationRuleTag}
              onChange={(val) => onUpdate({ validationRuleTag: val })}
              options={validationRuleOptions}
            />
          </div>

          <div className="flex items-stretch gap-3">
            <Toggle label="Mandatory" size="lg" checked={attribute.isMandatory} onChange={(checked) => onUpdate({ isMandatory: checked })} />
            <Toggle
              label="LOV Based"
              size="lg"
              checked={attribute.isLovBased ?? false}
              onChange={(checked) => {
                if (checked) {
                  const backend = activeAttributes.find((a) => a.Value === attribute.attributeTag);
                  const suggestedLov = backend?.PossibleLOVTag ?? null;
                  onUpdate({ isLovBased: true, lovTag: attribute.lovTag || suggestedLov });
                } else {
                  onUpdate({ isLovBased: false, lovTag: null });
                }
              }}
            />
            <div className={`flex-1 ${attribute.isLovBased ? '' : 'invisible pointer-events-none'}`}>
              <SearchableSelect
                value={attribute.lovTag ?? ''}
                onChange={(val) => onUpdate({ lovTag: val || null })}
                options={lovOptions}
                placeholder="Select LOV…"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2" id="attribute_edit_1">
            <SearchableSelect
              label="Source Field"
              placeholder="Select source field"
              value={attribute.sourceField}
              onChange={(val) => onUpdate({ sourceField: val })}
              options={fieldMeta.sourceFields.filter((f) => ALLOWED_SOURCE_FIELDS.has(f)).map((f) => ({ value: f, label: humanizeFieldName(f) }))}
            />
            <SearchableSelect
              label="Extraction Method"
              placeholder="Select extraction method"
              value={attribute.extractionOperation}
              onChange={(val) => onUpdate({
                extractionOperation: val as AttributeFormValue['extractionOperation'],
                numChars: undefined,
                toStr: undefined,
                occurrence: undefined,
                startingPosition: undefined,
                fromPosition: undefined,
              })}
              options={FILTERED_EXTRACTION_OPERATIONS.map((op) => ({ value: op.key, label: op.label }))}
            />
          </div>

          {attribute.extractionOperation === 'extract_substring' && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="From Position"
                placeholder="Starting position (required)"
                type="number"
                min={0}
                required
                value={attribute.fromPosition ?? ''}
                onChange={(e) => onUpdate({ fromPosition: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
          )}

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

          {filteredOp?.optionalFields && filteredOp.optionalFields.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {filteredOp.optionalFields.includes('numChars') && (
                <Input
                  label="# of Chars"
                  placeholder="Optional"
                  type="number"
                  min={1}
                  value={attribute.numChars ?? ''}
                  onChange={(e) => onUpdate({ numChars: e.target.value ? Number(e.target.value) : undefined })}
                />
              )}
              {filteredOp.optionalFields.includes('toStr') && (
                <Input
                  label="To String"
                  placeholder="Optional"
                  value={attribute.toStr ?? ''}
                  onChange={(e) => onUpdate({ toStr: e.target.value || undefined })}
                />
              )}
              {filteredOp.optionalFields.includes('startingPosition') && (
                <Input
                  label="Starting Position"
                  placeholder="Optional"
                  type="number"
                  min={0}
                  value={attribute.startingPosition ?? ''}
                  onChange={(e) => onUpdate({ startingPosition: e.target.value ? Number(e.target.value) : undefined })}
                />
              )}
              {filteredOp.optionalFields.includes('occurrence') && (
                <SearchableSelect
                  label="Occurrence"
                  placeholder="Optional"
                  value={attribute.occurrence ? String(attribute.occurrence) : ''}
                  onChange={(val) => onUpdate({ occurrence: val ? Number(val) : undefined })}
                  options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                />
              )}
            </div>
          )}

          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2 justify-between ">
              <p className="text-xs text-primary italic border-dashed border w-fit px-2 py-1">
                {humanizeFieldName(attribute.sourceField)} &rarr; <span className='text-orange-500'>{preview}</span>
              </p>
              {attribute.attributeTag.trim().length > 0 && (
                hasChanges ? (
                  <>
                    <Button variant="secondary" size="xs" onClick={handleDiscard} className="min-w-16 text-center">
                      Discard
                    </Button>
                    <Button variant="primary" size="xs" onClick={() => setEditing(false)} className="min-w-16 text-center">
                      Save
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="xs" onClick={() => setEditing(false)}>
                    Collapse Attribute
                  </Button>
                )
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
                variant="ghost" className='text-purple-500!' size="xs"
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
            className="flex-1 cursor-pointer hover:bg-surface-hover rounded px-2 py-1.5 transition-colors"
            onClick={() => { setSnapshot({ ...attribute }); setEditing(true); }}
          >
            <p className="text-xs">
              <span className="font-medium text-primary-dark">{attribute.attributeTag}</span>
              <span className="text-faint mx-1.5">&mdash;</span>
              <span className="text-primary italic">
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
                variant="ghost" className='text-purple-500!' size="xs"
                onClick={() => setShowDistinct(true)}
              >
                See all distinct values ({distinctValues.length})
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={onRemove} className="ml-1 text-red-400 hover:text-red-500">
              Remove
            </Button>
          </div>
        </div>
      )}

      {showDistinct && (() => {
        const lovMap = attribute.isLovBased && attribute.lovTag ? lovLookup.get(attribute.lovTag) : undefined;
        return (
          <Modal open onClose={() => setShowDistinct(false)} title={`Distinct values for "${attribute.attributeTag || 'Attribute'}"`}>
            <div className="space-y-1">
              {distinctValues.map((val, i) => {
                const resolved = lovMap?.get(val);
                return (
                  <div key={i} className="px-3 py-1.5 text-sm font-mono bg-surface-secondary rounded border border-border dark:text-primary-light">
                    {resolved ? <>{resolved} <span className="text-faint text-xs">({val})</span></> : val}
                  </div>
                );
              })}
            </div>
          </Modal>
        );
      })()}

      {createAttrOpen && (
        <AttributeFormModal
          open
          onClose={() => setCreateAttrOpen(false)}
          onSave={async (payload) => {
            await createNewAttribute({ Value: payload.Value, Details: payload.Details });
            onUpdate({ attributeTag: payload.Value });
          }}
        />
      )}
    </div>
  );
}
