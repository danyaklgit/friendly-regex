import { useState, useMemo, useCallback } from 'react';
import type { AttributeFormValue, TransactionRow } from '../../types';
import { Input } from '../shared/Input';
import { SearchableSelect } from '../shared/SearchableSelect';
import { Toggle } from '../shared/Toggle';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';
import { Modal } from '../shared/Modal';
import { VALIDATION_RULE_TAG_OPTIONS } from '../../constants/fields';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useTransactionData } from '../../hooks/useTransactionData';
import { EXTRACTION_OPERATIONS, PREDEFINED_PATTERNS } from '../../constants/operations';
import { generateExtractionPrompt, regexifyExtraction } from '../../utils/regexify';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { describeLiteralBoundary } from '../../utils/engregxify';
import { applyTransformation } from '../../utils/transformations';
import { AttributeFormModal } from '../attributes/AttributeFormModal';
import { TransformationList } from './TransformationList';
import { CommentIconButton } from '../comments/CommentIconButton';

const ALLOWED_SOURCE_FIELDS = new Set([
  'AdditionalInformation', 'Amount', 'BankReference', 'CurrencyCode',
  'Description1', 'Description2', 'EntryDate', 'FundsCode',
  'IBAN', 'StatementDate', 'TransactionDetails', 'TransactionStatusIndicator',
  'ValueDate',
]);

const FILTERED_EXTRACTION_OPERATIONS = EXTRACTION_OPERATIONS.filter(
  (op) => op.key !== 'predefined:ksa_iban' && op.key !== 'extract_between_and_verify'
);

/**
 * If `suffix` is exactly `(?:LITERAL|$)`, returns the unescaped literal portion.
 * Returns null when the shape doesn't match — including the "two or more
 * alternatives" form (`(?:a|b|$)`), which is genuinely multi-token and out of
 * scope for the literal+checkbox UI. Mirrors the same shape that
 * decomposeExtractionRegex pulls apart on load.
 */
function parseEoiAlternationSuffix(suffix: string): string | null {
  const m = suffix.match(/^\(\?:(.+?)\|\$\)$/);
  if (!m) return null;
  const literal = m[1];
  // Reject if the literal still contains an unescaped `|` — that's a multi-
  // alternative case (e.g. `(?:abc|def|$)`), which we leave as raw regex.
  if (/(?:^|[^\\])\|/.test(literal)) return null;
  return literal.replace(/\\([^dDwWsSbBntrfv0])/g, '$1');
}

interface AttributeEditorProps {
  attribute: AttributeFormValue;
  onUpdate: (updates: Partial<AttributeFormValue>) => void;
  onRemove: () => void;
  transactions?: TransactionRow[];
  startCollapsed?: boolean;
  readOnly?: boolean;
  /** True when this row's attributeTag duplicates an EARLIER attribute's name
   *  in the same tag. Only the later occurrence is flagged so the first one
   *  stays clean — caller (StepAttributes) decides which is which via
   *  computeDuplicateAttributeIndexes. */
  isDuplicateName?: boolean;
  /** When set, the attribute-name picker shows a "Suggested from other 'X' defs"
   *  section at the top with attribute names borrowed from other definitions
   *  that share this tag name (case-insensitive). */
  suggestedAttributeNames?: { name: string; count: number }[];
  /** Canonical tag name used in the section header copy. */
  suggestedTagName?: string;
  /** Comment scope — when both are provided, a comment icon is shown for this attribute. */
  libraryId?: string;
  definitionId?: string;
}

/**
 * Small info icon shown next to extraction-rule fields (Prefix, Suffix,
 * Pattern). On hover, the tooltip explains how the current field value
 * will be matched and how it shapes the extracted span. Content is built
 * from `text` on every render, so it stays in sync as the user types.
 */
function BoundaryHintIcon({
  text,
  role,
  ariaLabel,
}: {
  text: string;
  role: 'prefix' | 'suffix' | 'pattern';
  ariaLabel: string;
}) {
  // Cap the tooltip width and let long narrations wrap onto multiple lines.
  // The cap is wide enough for a typical phrase but narrow enough to avoid
  // sprawling across the whole screen for complex regex patterns.
  const content = (
    <div className="max-w-xs whitespace-normal leading-snug">
      {describeLiteralBoundary(text, role)}
    </div>
  );
  return (
    <Tooltip placement="top" content={content}>
      <button
        type="button"
        aria-label={ariaLabel}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-faint hover:text-body-secondary hover:bg-surface-tertiary transition-colors cursor-help"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    </Tooltip>
  );
}

export function AttributeEditor({ attribute, onUpdate, onRemove, transactions, startCollapsed, readOnly, isDuplicateName, suggestedAttributeNames, suggestedTagName, libraryId, definitionId }: AttributeEditorProps) {
  const { fieldMeta } = useTransactionData();
  const { activeAttributes, validationClasses, validationOptions, lovOptions, lovLookup, createNewAttribute, transformationMethods, extractionMethods } = useLovAttributes();
  const [showDistinct, setShowDistinct] = useState(false);
  const [editing, setEditing] = useState(
    !startCollapsed && attribute.attributeTag.trim().length === 0,
  );
  const [createAttrOpen, setCreateAttrOpen] = useState(false);
  const [showValidation, setShowValidation] = useState(!!attribute.validationRuleTag);
  const [hasSaved, setHasSaved] = useState(
    !!startCollapsed || attribute.attributeTag.trim().length > 0,
  );
  const [snapshot, setSnapshot] = useState<AttributeFormValue | null>(() =>
    !startCollapsed ? { ...attribute } : null
  );

  // Build attribute name options from backend attributes, with optional
  // "Suggested from other 'X' defs" section pinned at the top.
  const attributeNameOptions = useMemo(() => {
    const suggestedHeader = suggestedTagName
      ? `Suggested from other "${suggestedTagName}" defs`
      : 'Suggested';
    const suggested = (suggestedAttributeNames ?? []).map((s) => ({
      value: s.name,
      label: s.name,
      sublabel: `Used in ${s.count} other definition${s.count === 1 ? '' : 's'}`,
      group: suggestedHeader,
      groupClassName: 'text-orange-600 dark:text-orange-400',
      sublabelClassName: 'text-orange-600 dark:text-orange-400',
    }));
    const all = activeAttributes.map((a) => ({
      value: a.Value,
      label: a.Details.find((d) => d.LanguageCode === 'en')?.Name ?? a.Value,
      sublabel: a.PossibleLOVTag ? `Suggested LOV: ${a.PossibleLOVTag}` : undefined,
      group: suggested.length > 0 ? 'All attributes' : undefined,
    }));
    return [...suggested, ...all];
  }, [activeAttributes, suggestedAttributeNames, suggestedTagName]);

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

  // Required-field validation for the Save button
  const missingSaveFields = useMemo(() => {
    const missing: string[] = [];
    if (attribute.attributeTag.trim().length === 0) missing.push('Attribute Name');
    if (!attribute.sourceField || attribute.sourceField.trim().length === 0) missing.push('Source Field');
    if (!attribute.extractionOperation || attribute.extractionOperation.trim().length === 0) {
      missing.push('Extraction Method');
    } else if (selectedOp) {
      // Allow space-only values (e.g. prefix=' ' is a valid delimiter); reject only empty strings.
      for (const field of selectedOp.fields) {
        if (field === 'prefix' && (attribute.prefix ?? '').length === 0) missing.push('Prefix');
        if (field === 'suffix' && (attribute.suffix ?? '').length === 0) missing.push('Suffix');
        if (field === 'pattern' && (attribute.pattern ?? '').length === 0) missing.push('Pattern');
        if (field === 'verifyValue' && (attribute.verifyValue ?? '').length === 0) missing.push('Verify Value');
      }
      // extract_last_n_chars treats numChars as required — the operation has
      // no other tunable parameter, and emitting an unbounded fallback regex
      // would silently capture the whole field.
      if (selectedOp.key === 'extract_last_n_chars' && !(attribute.numChars && attribute.numChars > 0)) {
        missing.push('# of Chars');
      }
      // extract_skip_take needs a take count unless "till end of input" is on.
      if (selectedOp.key === 'extract_skip_take' && !attribute.tillEndOfInput && !(attribute.numChars && attribute.numChars > 0)) {
        missing.push('Take (characters)');
      }
    }
    return missing;
  }, [
    attribute.attributeTag,
    attribute.sourceField,
    attribute.extractionOperation,
    attribute.prefix,
    attribute.suffix,
    attribute.pattern,
    attribute.verifyValue,
    attribute.numChars,
    attribute.tillEndOfInput,
    selectedOp,
  ]);
  const canSaveAttribute = missingSaveFields.length === 0;
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
    suffixOrEndOfInput: attribute.suffixOrEndOfInput,
    tillEndOfInput: attribute.tillEndOfInput,
  }), [attribute.prefix, attribute.suffix, attribute.pattern, attribute.verifyValue, attribute.numChars, attribute.toStr, attribute.toStart, attribute.occurrence, attribute.startingPosition, attribute.fromPosition, attribute.prefixOccurrence, attribute.suffixOccurrence, attribute.suffixOrEndOfInput, attribute.tillEndOfInput]);
  // Prefer the LOV item's friendly Name when the op is a `lov:*` entry —
  // the pure util has no access to the LOV catalog and falls back to showing
  // the raw regex, which is ugly in the inline preview.
  //
  // For the inline header summary, clamp prefix/suffix/pattern/etc. to a
  // small per-field budget so a single very long prefix doesn't crowd out
  // the suffix (and vice versa) when truncate clips the overall line.
  const preview = useMemo(() => {
    if (attribute.extractionOperation.startsWith('lov:')) {
      const lovMatch = extractionMethods.find((m) => m.key === attribute.extractionOperation);
      if (lovMatch) return `Match ${lovMatch.label}`;
    }
    const TRUNC = 20;
    const clamp = (s: string | undefined) =>
      s && s.length > TRUNC ? s.slice(0, TRUNC - 1) + '…' : s;
    const shortParams = {
      ...extractionParams,
      prefix: clamp(extractionParams.prefix),
      suffix: clamp(extractionParams.suffix),
      pattern: clamp(extractionParams.pattern),
      toStr: clamp(extractionParams.toStr),
      verifyValue: clamp(extractionParams.verifyValue),
    };
    return generateExtractionPrompt(attribute.extractionOperation, shortParams);
  }, [attribute.extractionOperation, extractionParams, extractionMethods]);

  // Raw extracted values, BEFORE the post-extraction transformation pipeline.
  // The transformation preview's "Extracted" line and the transformation
  // sample feed off this — they must show what the regex captured, not what
  // the pipeline produced (otherwise "Extracted" and "To Lowercase" both show
  // the same string, hiding the diff the preview is meant to surface).
  const rawDistinctValues = useMemo(() => {
    if (!transactions || !attribute.sourceField) return [];
    try {
      // Prefer the original backend regex (lossless) over re-built one (escaping may differ)
      const rebuilt = attribute.extractionOperation
        ? regexifyExtraction(attribute.extractionOperation, extractionParams)
        : '';
      const regexStr = attribute._originalRegex || rebuilt;
      const regex = regexStr ? new RegExp(regexStr) : null;
      const values = new Set<string>();

      const scanServer = (list: unknown): string | null => {
        if (!Array.isArray(list)) return null;
        for (const entry of list) {
          if (entry && typeof entry === 'object') {
            const e = entry as { Key?: unknown; Value?: unknown };
            if (e.Key === attribute.attributeTag && e.Value != null && e.Value !== '') {
              return String(e.Value);
            }
          }
        }
        return null;
      };

      for (const row of transactions) {
        // 1) Try the (possibly drafted) regex client-side.
        const fieldValue = row[attribute.sourceField];
        const str = fieldValue !== undefined && fieldValue !== null ? String(fieldValue) : '';
        let captured: string | undefined;
        if (regex && str) {
          const match = str.match(regex);
          // Fall back to match[0] for lookahead-style patterns without an explicit capture group.
          captured = match ? (match[1] ?? match[0]) : undefined;
        } else if (!regex && str.trim()) {
          captured = str;
        }
        if (captured) {
          values.add(captured);
          continue;
        }
        // 2) Server-provided fallback from OpsAttributes / OpsMultiTags[*].Attributes.
        const r = row as unknown as Record<string, unknown>;
        let serverVal = scanServer(r.OpsAttributes);
        if (serverVal === null && Array.isArray(r.OpsMultiTags)) {
          for (const mt of r.OpsMultiTags) {
            if (mt && typeof mt === 'object') {
              const v = scanServer((mt as { Attributes?: unknown }).Attributes);
              if (v !== null) { serverVal = v; break; }
            }
          }
        }
        if (serverVal !== null) values.add(serverVal);
      }
      return Array.from(values).sort();
    } catch {
      return [];
    }
  }, [transactions, attribute.sourceField, attribute.attributeTag, attribute.extractionOperation, attribute.prefix, attribute.suffix, attribute.pattern, attribute.verifyValue, attribute._originalRegex, extractionParams]);

  // Distinct values WITH the transformation pipeline applied. Used by the
  // "See all distinct values" popup so it matches what the table renders.
  // Deduped after transformation so two raw values that map to the same
  // output collapse to one row.
  const distinctValues = useMemo(() => {
    const transformations = attribute.transformations ?? [];
    if (transformations.length === 0) return rawDistinctValues;
    const apply = (input: string): string => {
      let v = input;
      for (const t of transformations) {
        v = applyTransformation(t.method, t.args, v);
      }
      return v;
    };
    return Array.from(new Set(rawDistinctValues.map(apply))).sort();
  }, [rawDistinctValues, attribute.transformations]);

  // Sample value for transformation preview:
  // The preview must show the RAW extracted value on the "Extracted" line,
  // so use rawDistinctValues here, NOT the post-pipeline distinctValues.
  const transformationSample = useMemo(() => {
    if (rawDistinctValues.length > 0) return rawDistinctValues[0];
    if (!transactions || !attribute.sourceField) return undefined;
    for (const row of transactions) {
      const val = row[attribute.sourceField];
      if (val !== undefined && val !== null && String(val).trim()) return String(val);
    }
    return undefined;
  }, [rawDistinctValues, transactions, attribute.sourceField]);

  // For predefined patterns with validate: true or extract_between_and_verify, check if all rows pass
  const validationSummary = useMemo(() => {
    if (!transactions) return null;

    // Lookup the server-computed value for this attribute on a row, so
    // validation counts stay correct even when the client-side regex can't
    // reproduce the extraction (e.g. a suffix containing regex metachars
    // that the rule builder escapes as literals).
    const scanServer = (list: unknown): string | null => {
      if (!Array.isArray(list)) return null;
      for (const entry of list) {
        if (entry && typeof entry === 'object') {
          const e = entry as { Key?: unknown; Value?: unknown };
          if (e.Key === attribute.attributeTag && e.Value != null && e.Value !== '') {
            return String(e.Value);
          }
        }
      }
      return null;
    };
    const readServerValue = (row: TransactionRow): string | null => {
      const r = row as unknown as Record<string, unknown>;
      const primary = scanServer(r.OpsAttributes);
      if (primary !== null) return primary;
      if (Array.isArray(r.OpsMultiTags)) {
        for (const mt of r.OpsMultiTags) {
          if (mt && typeof mt === 'object') {
            const v = scanServer((mt as { Attributes?: unknown }).Attributes);
            if (v !== null) return v;
          }
        }
      }
      return null;
    };
    const extractClientValue = (row: TransactionRow, regex: RegExp): string | null => {
      const fieldValue = row[attribute.sourceField];
      if (fieldValue === undefined || fieldValue === null) return null;
      const match = String(fieldValue).match(regex);
      // Fall back to match[0] for patterns without an explicit capture group.
      return match ? (match[1] ?? match[0] ?? null) : null;
    };

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
          const extracted = extractClientValue(row, regex) ?? readServerValue(row);
          if (extracted === attribute.verifyValue) {
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

    // Handle ValidationClass regex — validate extracted values against the
    // class pattern AFTER the post-extraction transformation pipeline has run.
    // Validation is conceptually downstream of transformations in the UI
    // (Extraction → Transformations → Validations), so testing the raw
    // extracted value would let "✓ 50" lie about transformed output that no
    // longer satisfies the rule (e.g. an IBAN that loses its digits to a
    // Remove Numeric transformation).
    const vc = validationClasses.find((c) => c.Tag === attribute.validationRuleTag);
    if (vc?.Regex && attribute.sourceField) {
      try {
        const extractionRegex = new RegExp(regexifyExtraction(attribute.extractionOperation, extractionParams));
        const vcRegex = new RegExp(vc.Regex);
        const transformations = attribute.transformations ?? [];
        const applyTransforms = (input: string): string => {
          let v = input;
          for (const t of transformations) {
            v = applyTransformation(t.method, t.args, v);
          }
          return v;
        };
        let total = 0;
        let passed = 0;
        for (const row of transactions) {
          // Try the client regex first, fall back to the server-provided value.
          const extracted = extractClientValue(row, extractionRegex) ?? readServerValue(row);
          if (!extracted) continue;
          total++;
          const finalValue = transformations.length > 0 ? applyTransforms(extracted) : extracted;
          if (vcRegex.test(finalValue)) passed++;
        }
        if (total > 0) return { allValid: passed === total, passed, total, notPassed: total - passed };
      } catch { /* skip */ }
    }

    return null;
  }, [transactions, attribute.sourceField, attribute.attributeTag, attribute.extractionOperation, attribute.prefix, attribute.suffix, attribute.verifyValue, attribute.validationRuleTag, attribute.transformations, validationClasses, extractionParams]);

  // Mirrors RuleGroupEditor's banner: persistent (rendered whether the row is
  // expanded or collapsed) so the duplicate is always visible until resolved.
  const duplicateNameMessage = isDuplicateName
    ? `An attribute named "${attribute.attributeTag.trim()}" already exists in this tag. Rename or remove it to continue.`
    : null;

  return (
    <div className={`border rounded-lg bg-surface ${isDuplicateName ? 'border-red-400 dark:border-rose-400' : 'border-border'}`}>
      {duplicateNameMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-b border-red-400 dark:border-rose-400 bg-red-50 dark:bg-rose-900/20 text-xs text-red-600 dark:text-rose-300"
        >
          <span aria-hidden="true" className="font-bold leading-none">!</span>
          <span>{duplicateNameMessage}</span>
        </div>
      )}
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
                      {humanizeFieldName(attribute.sourceField)} &rarr; <span className="text-orange-500 dark:text-orange-300">{preview}</span>
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
            {libraryId && definitionId && attribute.attributeTag && (
              <CommentIconButton
                target={{
                  TagSpecLibraryId: libraryId,
                  TagSpecDefinitionId: definitionId,
                  AttributeTag: attribute.attributeTag,
                }}
                targetLabel={attribute.attributeTag}
                size="xs"
              />
            )}
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
            required={!readOnly}
            error={!readOnly && attribute.attributeTag.trim().length === 0}
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
              required={!readOnly}
              error={!readOnly && (!attribute.sourceField || attribute.sourceField.trim().length === 0)}
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
                suffixOrEndOfInput: undefined,
                tillEndOfInput: undefined,
              })}
              options={[
                ...FILTERED_EXTRACTION_OPERATIONS.map((op) => ({ value: op.key, label: op.label })),
                ...extractionMethods.map((m) => ({ value: m.key, label: m.label, sublabel: m.description })),
              ]}
              disabled={readOnly}
              required={!readOnly}
              error={!readOnly && (!attribute.extractionOperation || attribute.extractionOperation.trim().length === 0)}
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

          {attribute.extractionOperation === 'extract_skip_take' && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Skip (characters)"
                placeholder="Characters to skip from the start"
                type="number"
                min={0}
                value={attribute.fromPosition ?? ''}
                onChange={(e) => onUpdate({ fromPosition: e.target.value ? Number(e.target.value) : undefined })}
                disabled={readOnly}
              />
              <div className="flex flex-col gap-1.5">
                <Input
                  label="Take (characters)"
                  placeholder={attribute.tillEndOfInput ? 'Till end of input' : 'Required'}
                  type="number"
                  min={1}
                  required={!attribute.tillEndOfInput}
                  error={!readOnly && !attribute.tillEndOfInput && !(attribute.numChars && attribute.numChars > 0)}
                  value={attribute.tillEndOfInput ? '' : (attribute.numChars ?? '')}
                  onChange={(e) => onUpdate({ numChars: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={readOnly || !!attribute.tillEndOfInput}
                />
                <label className={`flex items-center gap-1.5 text-xs text-body-secondary pl-1 select-none ${readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={!!attribute.tillEndOfInput}
                    onChange={(e) => onUpdate({ tillEndOfInput: e.target.checked || undefined, ...(e.target.checked ? { numChars: undefined } : {}) })}
                    disabled={readOnly}
                  />
                  till end of input
                </label>
              </div>
            </div>
          )}

          {selectedOp && (
            <div className="grid grid-cols-2 gap-2" id="attribute_edit_2">
              {selectedOp.fields.includes('prefix') && (
                <div className="flex flex-col gap-1.5">
                  <Input
                    label="Prefix"
                    placeholder="e.g., /ORDP/"
                    value={attribute.prefix ?? ''}
                    onChange={(e) => onUpdate({ prefix: e.target.value })}
                    disabled={readOnly}
                    labelAdornment={<BoundaryHintIcon text={attribute.prefix ?? ''} role="prefix" ariaLabel="Prefix matching details" />}
                  />
                  {attribute.extractionOperation === 'extract_after' &&
                    (attribute.prefix ?? '').trim() === '^' &&
                    !readOnly && (
                      <div className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-2 flex items-start gap-2">
                        <svg className="w-4 h-4 mt-0.5 shrink-0 text-primary-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1 text-xs text-primary-dark">
                          <p>
                            Prefix <span className="font-mono">^</span> with <span className="font-medium">Extract After Prefix</span> is the same as extracting the entire source field.
                          </p>
                          <button
                            type="button"
                            onClick={() => onUpdate({
                              extractionOperation: 'extract_full_field',
                              prefix: undefined,
                              suffix: undefined,
                              pattern: undefined,
                              numChars: undefined,
                              toStr: undefined,
                              toStart: undefined,
                              occurrence: undefined,
                              startingPosition: undefined,
                              fromPosition: undefined,
                              prefixOccurrence: undefined,
                              suffixOccurrence: undefined,
                              suffixOrEndOfInput: undefined,
                              tillEndOfInput: undefined,
                            })}
                            className="mt-1 inline-flex items-center gap-1 font-medium underline hover:no-underline cursor-pointer"
                          >
                            Switch to Extract Full Field
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                </div>
              )}
              {selectedOp.fields.includes('suffix') && (() => {
                const suf = attribute.suffix ?? '';
                const eoiLiteral = !attribute.suffixOrEndOfInput
                  ? parseEoiAlternationSuffix(suf)
                  : null;
                return (
                  <div className="flex flex-col gap-1.5">
                    <Input
                      label="Suffix"
                      placeholder="e.g., /"
                      value={suf}
                      onChange={(e) => onUpdate({ suffix: e.target.value })}
                      disabled={readOnly}
                      labelAdornment={<BoundaryHintIcon text={suf} role="suffix" ariaLabel="Suffix matching details" />}
                    />
                    {eoiLiteral !== null && !readOnly && (
                      <div className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-2 flex items-start gap-2">
                        <svg className="w-4 h-4 mt-0.5 shrink-0 text-primary-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1 text-xs text-primary-dark">
                          <p>
                            This suffix is regex for "literal <span className="font-mono">{eoiLiteral || '(empty)'}</span> or end-of-input". Use the literal value with the checkbox below instead.
                          </p>
                          <button
                            type="button"
                            onClick={() => onUpdate({
                              suffix: eoiLiteral,
                              suffixOrEndOfInput: true,
                            })}
                            className="mt-1 inline-flex items-center gap-1 font-medium underline hover:no-underline cursor-pointer"
                          >
                            Use suffix <span className="font-mono">"{eoiLiteral}"</span> + check "or end of input"
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                    <label className={`flex items-center gap-1.5 text-xs text-body-secondary pl-1 select-none ${readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={!!attribute.suffixOrEndOfInput}
                        onChange={(e) => onUpdate({ suffixOrEndOfInput: e.target.checked || undefined })}
                        disabled={readOnly}
                      />
                      or end of input
                    </label>
                  </div>
                );
              })()}
              {selectedOp.fields.includes('pattern') && (
                <Input
                  label="Pattern"
                  placeholder="e.g., \\d{4}"
                  value={attribute.pattern ?? ''}
                  onChange={(e) => onUpdate({ pattern: e.target.value })}
                  disabled={readOnly}
                  labelAdornment={<BoundaryHintIcon text={attribute.pattern ?? ''} role="pattern" ariaLabel="Pattern matching details" />}
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
              {filteredOp.optionalFields.includes('numChars') && (() => {
                const numCharsRequired = filteredOp.key === 'extract_last_n_chars';
                const numCharsMissing = numCharsRequired && !(attribute.numChars && attribute.numChars > 0);
                return (
                  <Input
                    label="# of Chars"
                    placeholder={numCharsRequired ? 'Required' : 'Optional'}
                    type="number"
                    min={1}
                    required={numCharsRequired}
                    error={numCharsMissing}
                    value={attribute.numChars ?? ''}
                    onChange={(e) => onUpdate({ numChars: e.target.value ? Number(e.target.value) : undefined })}
                    disabled={!!attribute.toStart || readOnly}
                  />
                );
              })()}
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
                    <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${attribute.toStart ? 'bg-primary' : 'bg-border-strong dark:bg-faint'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${attribute.toStart ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                    </span>
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
              {!readOnly && (
                <>
                  {hasChanges && attribute.attributeTag.trim().length > 0 && (
                    <Button variant="secondary" size="xs" onClick={handleDiscard} className="min-w-16 text-center shrink-0">
                      Discard
                    </Button>
                  )}
                  {canSaveAttribute && !isDuplicateName ? (
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={() => { setHasSaved(true); setEditing(false); }}
                      className="min-w-16 text-center shrink-0"
                    >
                      Save
                    </Button>
                  ) : (
                    <Tooltip
                      content={
                        isDuplicateName
                          ? 'Rename or remove the duplicate attribute before saving.'
                          : `Missing: ${missingSaveFields.join(', ')}`
                      }
                      placement="top"
                    >
                      <span>
                        <Button
                          variant="primary"
                          size="xs"
                          disabled
                          className="min-w-16 text-center shrink-0"
                        >
                          Save
                        </Button>
                      </span>
                    </Tooltip>
                  )}
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
        <div className="flex items-center justify-between gap-2 px-3 py-2 min-w-0">
          <div
            className="flex-1 min-w-0 cursor-pointer hover:bg-surface-hover rounded px-2 py-1.5 transition-colors flex items-center gap-1.5"
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
            <p className="text-xs truncate min-w-0">
              <span className="font-medium text-primary-dark">{attribute.attributeTag}</span>
              <span className="text-faint mx-1.5">&mdash;</span>
              <span className="text-primary italic">
                {humanizeFieldName(attribute.sourceField)} &rarr; <span className='text-orange-500 dark:text-orange-300'>{preview}</span>
              </span>
              {(attribute.transformations?.length ?? 0) > 0 && (
                <span className="text-purple-400 ml-1.5 text-[10px]">
                  +{attribute.transformations!.length} transform{attribute.transformations!.length > 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
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
            {libraryId && definitionId && attribute.attributeTag && (
              <CommentIconButton
                target={{
                  TagSpecLibraryId: libraryId,
                  TagSpecDefinitionId: definitionId,
                  AttributeTag: attribute.attributeTag,
                }}
                targetLabel={attribute.attributeTag}
                size="xs"
              />
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
