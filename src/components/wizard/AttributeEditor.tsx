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
import { TransformationList } from './TransformationList';

const ALLOWED_SOURCE_FIELDS = new Set([
  'AdditionalInformation', 'Amount', 'BankReference', 'CurrencyCode',
  'Description1', 'Description2', 'EntryDate', 'FundsCode',
  'IBAN', 'StatementDate', 'TransactionDetails', 'TransactionStatusIndicator',
  'ValueDate',
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
  readOnly?: boolean;
}

export function AttributeEditor({ attribute, onUpdate, onRemove, transactions, startCollapsed, readOnly }: AttributeEditorProps) {
  const { fieldMeta } = useTransactionData();
  const { activeAttributes, validationClasses, validationOptions, lovOptions, lovLookup, createNewAttribute, transformationMethods } = useLovAttributes();
  const [showDistinct, setShowDistinct] = useState(false);
  const [editing, setEditing] = useState(!startCollapsed);
  const [createAttrOpen, setCreateAttrOpen] = useState(false);
  const [showValidation, setShowValidation] = useState(!!attribute.validationRuleTag);
  const [hasSaved, setHasSaved] = useState(!!startCollapsed);
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
    (validationOptions.length > 0
      ? validationOptions
      : VALIDATION_RULE_TAG_OPTIONS.map((t) => ({ value: t, label: t }))
    ).slice().sort((a, b) => a.label.localeCompare(b.label)),
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
      (attribute.fromPosition ?? 0) !== (snapshot.fromPosition ?? 0) ||
      (attribute.toStart ?? false) !== (snapshot.toStart ?? false) ||
      (attribute.prefixOccurrence ?? 0) !== (snapshot.prefixOccurrence ?? 0) ||
      (attribute.suffixOccurrence ?? 0) !== (snapshot.suffixOccurrence ?? 0) ||
      JSON.stringify(attribute.transformations ?? []) !== JSON.stringify(snapshot.transformations ?? [])
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
    toStart: attribute.toStart,
    prefixOccurrence: attribute.prefixOccurrence,
    suffixOccurrence: attribute.suffixOccurrence,
  }), [attribute.prefix, attribute.suffix, attribute.pattern, attribute.verifyValue, attribute.numChars, attribute.toStr, attribute.toStart, attribute.occurrence, attribute.startingPosition, attribute.fromPosition, attribute.prefixOccurrence, attribute.suffixOccurrence]);
  const preview = generateExtractionPrompt(attribute.extractionOperation, extractionParams);

  const distinctValues = useMemo(() => {
    if (!transactions || !attribute.sourceField) return [];
    try {
      // Prefer the original backend regex (lossless) over re-built one (escaping may differ)
      const rebuilt = attribute.extractionOperation
        ? regexifyExtraction(attribute.extractionOperation, extractionParams)
        : '';
      const regexStr = attribute._originalRegex || rebuilt;
      const regex = regexStr ? new RegExp(regexStr) : null;
      const values = new Set<string>();
      for (const row of transactions) {
        const fieldValue = row[attribute.sourceField];
        if (fieldValue === undefined || fieldValue === null) continue;
        const str = String(fieldValue);
        if (regex) {
          const match = str.match(regex);
          if (match?.[1]) values.add(match[1]);
        } else if (str.trim()) {
          values.add(str);
        }
      }
      return Array.from(values).sort();
    } catch {
      return [];
    }
  }, [transactions, attribute.sourceField, attribute.extractionOperation, attribute.prefix, attribute.suffix, attribute.pattern, attribute.verifyValue, attribute._originalRegex, extractionParams]);

  // Sample value for transformation preview:
  // If extraction method is set, use the first extracted value; otherwise use the raw source field value
  const transformationSample = useMemo(() => {
    if (distinctValues.length > 0) return distinctValues[0];
    if (!transactions || !attribute.sourceField) return undefined;
    for (const row of transactions) {
      const val = row[attribute.sourceField];
      if (val !== undefined && val !== null && String(val).trim()) return String(val);
    }
    return undefined;
  }, [distinctValues, transactions, attribute.sourceField]);

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
    <div className="border border-border rounded-lg bg-surface">
      {editing ? (
        <div className="space-y-4 p-3">
          {/* Header: collapse arrow + preview + Remove */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {attribute.attributeTag.trim().length > 0 && hasSaved && !hasChanges && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-faint hover:text-body transition-colors p-0.5 cursor-pointer shrink-0"
                  title="Collapse Attribute"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              )}
              <p className="text-xs truncate">
                <span className="font-medium text-primary-dark">{attribute.attributeTag || 'New Attribute'}</span>
                {attribute.sourceField && (
                  <>
                    <span className="text-faint mx-1.5">&mdash;</span>
                    <span className="text-primary italic">
                      {humanizeFieldName(attribute.sourceField)} &rarr; <span className="text-orange-500">{preview}</span>
                    </span>
                  </>
                )}
                {(attribute.transformations?.length ?? 0) > 0 && (
                  <span className="text-purple-400 ml-1.5 text-[10px]">
                    +{attribute.transformations!.length} transform{attribute.transformations!.length > 1 ? 's' : ''}
                  </span>
                )}
              </p>
            </div>
            {!readOnly && (
              <Button variant="ghost" size="xs" onClick={onRemove} className="text-red-400 hover:text-red-500 shrink-0">
                Remove Attribute
              </Button>
            )}
          </div>

          {/* Attribute Name */}
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
            disabled={readOnly}
            onCreateNew={readOnly ? undefined : () => setCreateAttrOpen(true)}
            createNewLabel="+ Create New Attribute"
          />

          {/* Toggles + LOV */}
          <div className="flex items-center gap-3">
            <Toggle label="Mandatory" size="lg" checked={attribute.isMandatory} onChange={(checked) => onUpdate({ isMandatory: checked })} disabled={readOnly} />
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
              disabled={readOnly}
            />
            {attribute.isLovBased && (
              <div className="flex-1">
                <SearchableSelect
                  value={attribute.lovTag ?? ''}
                  onChange={(val) => onUpdate({ lovTag: val || null })}
                  options={lovOptions}
                  placeholder="Select LOV…"
                  disabled={readOnly}
                />
              </div>
            )}
          </div>

          {/* ── Extraction ── */}
          <div className="border-t border-border-subtle pt-3 space-y-2">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">Extraction</p>
            <div className="grid grid-cols-2 gap-2" id="attribute_edit_1">
            <SearchableSelect
              label="Source Field"
              placeholder="Select source field"
              value={attribute.sourceField}
              onChange={(val) => onUpdate({ sourceField: val })}
              options={fieldMeta.sourceFields.filter((f) => ALLOWED_SOURCE_FIELDS.has(f)).map((f) => ({ value: f, label: humanizeFieldName(f) })).sort((a, b) => a.label.localeCompare(b.label))}
              disabled={readOnly}
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
                prefixOccurrence: undefined,
                suffixOccurrence: undefined,
              })}
              options={FILTERED_EXTRACTION_OPERATIONS.map((op) => ({ value: op.key, label: op.label }))}
              disabled={readOnly}
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
                disabled={readOnly}
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
                  disabled={readOnly}
                />
              )}
              {selectedOp.fields.includes('suffix') && (
                <Input
                  label="Suffix"
                  placeholder="e.g., /"
                  value={attribute.suffix ?? ''}
                  onChange={(e) => onUpdate({ suffix: e.target.value })}
                  disabled={readOnly}
                />
              )}
              {selectedOp.fields.includes('pattern') && (
                <Input
                  label="Pattern"
                  placeholder="e.g., \\d{4}"
                  value={attribute.pattern ?? ''}
                  onChange={(e) => onUpdate({ pattern: e.target.value })}
                  disabled={readOnly}
                />
              )}
              {selectedOp.fields.includes('verifyValue') && (
                <Input
                  label="Verify Value"
                  placeholder="Expected extracted value"
                  value={attribute.verifyValue ?? ''}
                  onChange={(e) => onUpdate({ verifyValue: e.target.value })}
                  disabled={readOnly}
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
                  disabled={!!attribute.toStart || readOnly}
                />
              )}
              {filteredOp.optionalFields.includes('toStr') && (
                <Input
                  label="To String"
                  placeholder="Optional"
                  value={attribute.toStr ?? ''}
                  onChange={(e) => onUpdate({ toStr: e.target.value || undefined })}
                  disabled={!!attribute.toStart || readOnly}
                />
              )}
              {filteredOp.optionalFields.includes('toStart') && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-body pl-1">To Start</label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={attribute.toStart ?? false}
                    disabled={readOnly}
                    onClick={() => { if (readOnly) return; const checked = !(attribute.toStart ?? false); onUpdate({ toStart: checked, ...(checked ? { numChars: undefined, toStr: undefined } : {}) }); }}
                    className={`flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-sm font-medium transition-all ${readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                      ${attribute.toStart
                        ? 'bg-primary/10 border-primary/30 text-primary-dark dark:text-primary'
                        : 'bg-input-bg border-input-border text-body hover:bg-surface-hover'
                      }`}
                  >
                    <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0 ${attribute.toStart ? 'bg-primary' : 'bg-border-strong dark:bg-faint'}`}>
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${attribute.toStart ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                    </span>
                    {attribute.toStart ? 'On' : 'Off'}
                  </button>
                </div>
              )}
              {filteredOp.optionalFields.includes('startingPosition') && (
                <Input
                  label="Starting Position"
                  placeholder="Optional"
                  type="number"
                  min={0}
                  value={attribute.startingPosition ?? ''}
                  onChange={(e) => onUpdate({ startingPosition: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={readOnly}
                />
              )}
              {filteredOp.optionalFields.includes('occurrence') && (
                <SearchableSelect
                  label="Occurrence"
                  placeholder="Optional"
                  value={attribute.occurrence ? String(attribute.occurrence) : ''}
                  onChange={(val) => onUpdate({ occurrence: val ? Number(val) : undefined })}
                  options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                  disabled={readOnly}
                />
              )}
              {filteredOp.optionalFields.includes('prefixOccurrence') && (
                <SearchableSelect
                  label="Prefix Occurrence"
                  placeholder="Optional"
                  value={attribute.prefixOccurrence ? String(attribute.prefixOccurrence) : ''}
                  onChange={(val) => onUpdate({ prefixOccurrence: val ? Number(val) : undefined })}
                  options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                  disabled={readOnly}
                />
              )}
              {filteredOp.optionalFields.includes('suffixOccurrence') && (
                <SearchableSelect
                  label="Suffix Occurrence"
                  placeholder="Optional"
                  value={attribute.suffixOccurrence ? String(attribute.suffixOccurrence) : ''}
                  onChange={(val) => onUpdate({ suffixOccurrence: val ? Number(val) : undefined })}
                  options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                  disabled={readOnly}
                />
              )}
            </div>
          )}
          </div>

          {/* ── Post-extraction Transformations ── */}
          {!!attribute.sourceField && !(readOnly && (attribute.transformations ?? []).length === 0) && (
            <div className="border-t border-border-subtle pt-3">
              <TransformationList
                transformations={attribute.transformations ?? []}
                methods={transformationMethods}
                sampleValue={transformationSample}
                onChange={(transformations) => onUpdate({ transformations })}
                readOnly={readOnly}
              />
            </div>
          )}

          {/* ── Validations ── */}
          {!(readOnly && !showValidation) && (
            <div className="border-t border-border-subtle pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">Validations</p>
                {!showValidation && !readOnly && (
                  <Button variant="ghost" size="xs" onClick={() => setShowValidation(true)}>
                    + Add Validation
                  </Button>
                )}
              </div>
              {showValidation && (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      placeholder="Select validation class"
                      value={attribute.validationRuleTag}
                      onChange={(val) => onUpdate({ validationRuleTag: val })}
                      options={validationRuleOptions}
                      disabled={readOnly}
                    />
                  </div>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => { onUpdate({ validationRuleTag: '' }); setShowValidation(false); }}
                      className="text-red-400 hover:text-red-500"
                    >
                      Remove Validation
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Footer: actions ── */}
          <div className="border-t border-border-subtle pt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {attribute.attributeTag.trim().length > 0 && !readOnly && hasChanges && (
                <>
                  <Button variant="secondary" size="xs" onClick={handleDiscard} className="min-w-16 text-center shrink-0">
                    Discard
                  </Button>
                  <Button variant="primary" size="xs" onClick={() => { setHasSaved(true); setEditing(false); }} className="min-w-16 text-center shrink-0">
                    Save
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {validationSummary && (
                <span className="text-xs font-medium flex gap-2">
                  {validationSummary.passed > 0 && <span className="text-emerald-600">{'\u2713'} {validationSummary.passed}</span>}
                  {(validationSummary.notPassed || 0) > 0 && <span className="text-red-600">{'\u2717'} {validationSummary.notPassed}</span>}
                </span>
              )}
              {transactions && distinctValues.length > 0 && (
                <Button
                  variant="ghost" className="text-purple-500!" size="xs"
                  onClick={() => setShowDistinct(true)}
                >
                  See all distinct values ({distinctValues.length})
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-3 py-2">
          <div
            className="flex-1 cursor-pointer hover:bg-surface-hover rounded px-2 py-1.5 transition-colors flex items-center gap-1.5"
            onClick={() => { setSnapshot({ ...attribute }); setEditing(true); }}
          >
            <svg
              className="w-3.5 h-3.5 text-faint shrink-0 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <p className="text-xs">
              <span className="font-medium text-primary-dark">{attribute.attributeTag}</span>
              <span className="text-faint mx-1.5">&mdash;</span>
              <span className="text-primary italic">
                {humanizeFieldName(attribute.sourceField)} &rarr; <span className='text-orange-500'>{preview}</span>
              </span>
              {(attribute.transformations?.length ?? 0) > 0 && (
                <span className="text-purple-400 ml-1.5 text-[10px]">
                  +{attribute.transformations!.length} transform{attribute.transformations!.length > 1 ? 's' : ''}
                </span>
              )}
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
            {!readOnly && (
              <Button variant="ghost" size="xs" onClick={onRemove} className="ml-1 text-red-400 hover:text-red-500">
                Remove Attribute
              </Button>
            )}
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
