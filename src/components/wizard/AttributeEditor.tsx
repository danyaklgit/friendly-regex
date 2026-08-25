import { useState, useMemo, useCallback, useEffect } from 'react';
import type { AttributeFormValue, TransactionRow } from '../../types';
import { Input } from '../shared/Input';
import { SearchableSelect } from '../shared/SearchableSelect';
import { Toggle } from '../shared/Toggle';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';
import { VALIDATION_RULE_TAG_OPTIONS, LEDGER_SOURCE_FIELDS } from '../../constants/fields';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useTransactionData } from '../../hooks/useTransactionData';
import { EXTRACTION_OPERATIONS, PREDEFINED_PATTERNS } from '../../constants/operations';
import { TRANSFORMATION_METHOD_MAP } from '../../constants/transformations';
import { generateExtractionPrompt, regexifyExtraction } from '../../utils/regexify';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { describeLiteralBoundary } from '../../utils/engregxify';
import { applyTransformation } from '../../utils/transformations';
import { stringifyFieldValue } from '../../utils/extractAttributes';
import { containsRtl } from '../../utils/bidi';
import { CharacterBreakdown, HighlightedText } from '../shared/CharacterBreakdown';
import { Modal } from '../shared/Modal';
import { AttributeFormModal } from '../attributes/AttributeFormModal';
import { TransformationList } from './TransformationList';
import { WizardCommentIconButton } from './WizardCommentIconButton';
import { DistinctValuesModal } from './DistinctValuesModal';
import { AttributeConfigSuggestionsModal } from './AttributeConfigSuggestionsModal';
import type { AttributeConfigSuggestion } from '../../utils/attributeConfigSuggestions';

const ALLOWED_SOURCE_FIELDS = new Set([
  'AdditionalInformation', 'Amount', 'BankReference', 'CurrencyCode',
  'Description1', 'Description2', 'EntryDate', 'FundsCode',
  'IBAN', 'StatementDate', 'TransactionDetails', 'TransactionStatusIndicator',
  'ValueDate',
  // Ledger model V2 date (StatementDate's Ledger counterpart).
  'PostingDate',
  // Ledger fields — only surface when the loaded rows carry them (the
  // dropdown intersects this set with fieldMeta.sourceFields).
  ...LEDGER_SOURCE_FIELDS,
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
  /** Duplicates the attribute as a new sibling immediately below this row.
   *  Mirrors the rule-set Clone affordance from RuleGroupEditor — useful
   *  when two attributes share most of their config (extraction method,
   *  prefix/suffix) and only differ in a few fields. */
  onClone: () => void;
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
  /** Comment scope — when both are provided, a comment icon is shown for this attribute.
   *  `definitionId` also scopes the backend distinct-values query (see
   *  DistinctValuesModal); when missing, the backend distinct popup shows
   *  a warning instead of issuing a request. */
  libraryId?: string;
  definitionId?: string;
  /** Lifecycle of the parent library — used by the distinct-values modal
   *  to decide whether to send the Ops* filter columns (INPROGRESS) or
   *  the active filter columns (ACTIVE / released). Defaults to 'ops' in
   *  the modal when omitted. */
  tagSpecKind?: 'ops' | 'active';
  /** Fired whenever this row's local Save/Discard edit mode flips so the
   *  outer Create Rule button can disable while any row is still
   *  uncommitted. Also fires on unmount with `false` so removed rows
   *  leave the parent's "currently editing" set. */
  onEditingChange?: (attributeId: string, editing: boolean) => void;
  /** Same-bank extraction configs the operator can borrow for the current
   *  attribute name. Computed upstream from `libraries + activeCheckout.bank
   *  + attribute.attributeTag`. When non-empty, a "Suggestions" button shows
   *  up next to the attribute-name picker; clicking it opens a modal where
   *  the operator picks a card to overwrite source field / extraction /
   *  transformations / validation in this row. */
  configSuggestions?: AttributeConfigSuggestion[];
  /** Global "Character view" toggle. When on, the extraction / transformation
   *  previews show the logical-order character breakdown for RTL samples; when
   *  off, the previews stay normal (no breakdown). Tied to the same toggle that
   *  controls the table so turning it off reverts the rule builder too. */
  characterView?: boolean;
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

export function AttributeEditor({ attribute, onUpdate, onRemove, onClone, transactions, startCollapsed, readOnly, isDuplicateName, suggestedAttributeNames, suggestedTagName, libraryId, definitionId, tagSpecKind, onEditingChange, configSuggestions, characterView = false }: AttributeEditorProps) {
  const { fieldMeta } = useTransactionData();
  const { activeAttributes, validationClasses, validationOptions, lovOptions, lovDescriptionLookup, createNewAttribute, transformationMethods, extractionMethods } = useLovAttributes();
  const [showDistinct, setShowDistinct] = useState(false);
  // Separate state for the backend-sourced "all distinct values" popup that
  // opens from inside the in-memory modal. Keeping it independent means
  // closing the inner popup doesn't dismiss the outer one.
  const [showBackendDistinct, setShowBackendDistinct] = useState(false);
  const [editing, setEditing] = useState(
    !startCollapsed && attribute.attributeTag.trim().length === 0,
  );
  const [createAttrOpen, setCreateAttrOpen] = useState(false);
  const [configSuggestionsOpen, setConfigSuggestionsOpen] = useState(false);
  const [showValidation, setShowValidation] = useState(!!attribute.validationRuleTag);
  const [hasSaved, setHasSaved] = useState(
    !!startCollapsed || attribute.attributeTag.trim().length > 0,
  );
  const [snapshot, setSnapshot] = useState<AttributeFormValue | null>(() =>
    !startCollapsed ? { ...attribute } : null
  );

  // Bubble edit-mode state up to the rule-builder header so the "Create
  // Rule with current settings" button can stay disabled while any
  // attribute is still mid-edit. Cleanup fires `false` on unmount so a
  // removed row doesn't leave the parent's set thinking it's still
  // editing.
  useEffect(() => {
    onEditingChange?.(attribute.id, editing);
    return () => {
      onEditingChange?.(attribute.id, false);
    };
  }, [editing, attribute.id, onEditingChange]);

  // Dispatch the event TransactionTable listens for. The table walks the
  // viewport into view (vertical) and scrolls the matching `<th data-
  // column-key="attr:<name>">` into the horizontal frame. Guarded on a
  // non-empty name because the column doesn't exist until the operator
  // has picked one.
  const handleViewAttrColumn = useCallback(() => {
    const name = attribute.attributeTag.trim();
    if (!name) return;
    window.dispatchEvent(
      new CustomEvent('tep:view-attr-column', { detail: { attributeName: name } }),
    );
  }, [attribute.attributeTag]);

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
      JSON.stringify(attribute.preExtractionTransformations ?? []) !== JSON.stringify(snapshot.preExtractionTransformations ?? []) ||
      JSON.stringify(attribute.transformations ?? []) !== JSON.stringify(snapshot.transformations ?? [])
    );
  }, [attribute, snapshot]);

  const handleDiscard = useCallback(() => {
    if (!snapshot) return;
    // Build an explicit reset payload covering every modifiable field.
    // `onUpdate` is a partial merge in the parent, and `{ ...snapshot }`
    // for a brand-new attribute lacks keys the operator added later
    // (e.g. `isConstant`, `constantValue`, `pattern`) — those keys
    // weren't created by `createEmptyAttribute`, so spreading the
    // snapshot leaves whatever the operator toggled on still set.
    // Listing each field forces the merge to overwrite, so Discard
    // truly restores the row to its pre-edit state.
    const reset: Partial<AttributeFormValue> = {
      attributeTag: snapshot.attributeTag,
      isMandatory: snapshot.isMandatory ?? false,
      validationRuleTag: snapshot.validationRuleTag ?? '',
      sourceField: snapshot.sourceField ?? '',
      extractionOperation: snapshot.extractionOperation,
      prefix: snapshot.prefix ?? '',
      suffix: snapshot.suffix ?? '',
      pattern: snapshot.pattern,
      verifyValue: snapshot.verifyValue,
      numChars: snapshot.numChars,
      toStr: snapshot.toStr,
      occurrence: snapshot.occurrence,
      startingPosition: snapshot.startingPosition,
      fromPosition: snapshot.fromPosition,
      toStart: snapshot.toStart,
      tillEndOfInput: snapshot.tillEndOfInput,
      prefixOccurrence: snapshot.prefixOccurrence,
      suffixOccurrence: snapshot.suffixOccurrence,
      suffixOrEndOfInput: snapshot.suffixOrEndOfInput,
      isConstant: snapshot.isConstant ?? false,
      constantValue: snapshot.constantValue,
      isLovBased: snapshot.isLovBased ?? false,
      lovTag: snapshot.lovTag ?? null,
      preExtractionTransformations: snapshot.preExtractionTransformations ?? [],
      transformations: snapshot.transformations ?? [],
      _originalRegex: snapshot._originalRegex,
    };
    onUpdate(reset);
    setSnapshot({ ...snapshot });
  }, [snapshot, onUpdate]);

  const selectedOp = EXTRACTION_OPERATIONS.find((op) => op.key === attribute.extractionOperation);
  const filteredOp = FILTERED_EXTRACTION_OPERATIONS.find((op) => op.key === attribute.extractionOperation);

  // Required-field validation for the Save button
  const missingSaveFields = useMemo(() => {
    const missing: string[] = [];
    if (attribute.attributeTag.trim().length === 0) missing.push('Attribute Name');
    // Constant-mode attributes hide the extraction / transformation / validation
    // sections entirely — only the literal value is required.
    if (attribute.isConstant) {
      if ((attribute.constantValue ?? '').trim().length === 0) missing.push('Constant Value');
      return missing;
    }
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
    // Each post-extraction transformation row must have its required args
    // filled. Without this gate, a Split & Pick row with an empty Pick
    // Index would let the operator click Save while the transformation
    // silently defaulted to index 0 at runtime — same trap covered by
    // hasIncompleteAttribute at the wizard level, mirrored here for the
    // per-row Save button.
    for (const t of attribute.transformations ?? []) {
      if (!t.method) {
        missing.push('Transformation Method');
        continue;
      }
      const def = TRANSFORMATION_METHOD_MAP.get(t.method);
      if (!def) continue;
      for (const arg of def.args) {
        if (!arg.required) continue;
        // Raw length (no trim) so a single-space delimiter — a real,
        // meaningful value for `replace.find` / `split_and_pick.delimiter`
        // — counts as present. Matches the extraction-field gate above.
        // An `allowEmpty` arg (e.g. Replace With) treats a blank value as valid
        // intent (delete the matched text), so it must NOT block Save. Mirrors
        // isCompleteTransformation — keep the two in lock-step.
        const val = t.args?.[arg.key];
        if ((val == null || val.length === 0) && !arg.allowEmpty) {
          missing.push(`${def.label}: ${arg.label}`);
        }
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
    attribute.isConstant,
    attribute.constantValue,
    attribute.transformations,
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
    const TRUNC = 20;
    const clamp = (s: string | undefined) =>
      s && s.length > TRUNC ? s.slice(0, TRUNC - 1) + '…' : s;
    // Constant mode: show the literal value as the summary, no extraction prompt.
    if (attribute.isConstant) {
      return `= "${clamp(attribute.constantValue) ?? ''}"`;
    }
    if (attribute.extractionOperation.startsWith('lov:')) {
      const lovMatch = extractionMethods.find((m) => m.key === attribute.extractionOperation);
      if (lovMatch) return `Match ${lovMatch.label}`;
    }
    const shortParams = {
      ...extractionParams,
      prefix: clamp(extractionParams.prefix),
      suffix: clamp(extractionParams.suffix),
      pattern: clamp(extractionParams.pattern),
      toStr: clamp(extractionParams.toStr),
      verifyValue: clamp(extractionParams.verifyValue),
    };
    return generateExtractionPrompt(attribute.extractionOperation, shortParams);
  }, [attribute.isConstant, attribute.constantValue, attribute.extractionOperation, extractionParams, extractionMethods]);

  // Pre-extraction pipeline applied to the stringified raw source field
  // value. Mirrors the runtime in `extractAttributes.ts`: empty pipeline =
  // pass-through. Used by every downstream memo that needs to feed the
  // extraction regex (rawDistinctValues, extractionPreview, the four-stage
  // preview chain), so they stay consistent with what the saved rule will
  // compute at tagging time.
  const applyPreExtraction = useCallback(
    (raw: string): string => {
      const pre = attribute.preExtractionTransformations ?? [];
      if (pre.length === 0) return raw;
      let v = raw;
      for (const t of pre) {
        v = applyTransformation(t.method, t.args, v);
      }
      return v;
    },
    [attribute.preExtractionTransformations],
  );

  // Sample value fed into the PRE-extraction TransformationList preview.
  // The first row in the loaded transactions sample whose source field has
  // a non-empty value, stringified the same way extractAttributes does.
  // Picked once and shared across renders so the operator's preview is
  // stable while they edit the pipeline.
  const rawSourceSample = useMemo<string>(() => {
    if (!transactions || !attribute.sourceField) return '';
    for (const row of transactions) {
      const v = row[attribute.sourceField];
      if (v === undefined || v === null) continue;
      const s = stringifyFieldValue(attribute.sourceField, v);
      if (s) return s;
    }
    return '';
  }, [transactions, attribute.sourceField]);

  // Raw extracted values, BEFORE the post-extraction transformation pipeline.
  // The transformation preview's "Extracted" line and the transformation
  // sample feed off this — they must show what the regex captured, not what
  // the pipeline produced (otherwise "Extracted" and "To Lowercase" both show
  // the same string, hiding the diff the preview is meant to surface).
  // Pre-extraction transformations are applied to each row's stringified
  // value BEFORE the regex runs, so distinct values reflect what the saved
  // rule will produce at tagging time.
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
        // Use the shared stringifier so Amount picks up its `.toFixed(2)`
        // form (preserves the decimal precision the table displays).
        // Then run the pre-extraction pipeline before the regex sees the
        // value — exactly mirrors the runtime in extractAttributes.ts.
        const rawStr = fieldValue !== undefined && fieldValue !== null
          ? stringifyFieldValue(attribute.sourceField, fieldValue) : '';
        const str = rawStr ? applyPreExtraction(rawStr) : '';
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
  }, [transactions, attribute.sourceField, attribute.attributeTag, attribute.extractionOperation, attribute.prefix, attribute.suffix, attribute.pattern, attribute.verifyValue, attribute._originalRegex, extractionParams, applyPreExtraction]);

  // Distinct values WITH the transformation pipeline applied. Used by the
  // "See all distinct values" popup so it matches what the table renders.
  // First row in the transactions sample whose source field contains a
  // value the current extraction regex captures. Used to render an
  // "Extraction Preview" panel below the extraction inputs so the
  // operator can see what their regex produces from real data before
  // setting up any post-extraction transformations. Null when there's no
  // source field, no extraction method, no transactions, or no row in
  // the loaded sample where the regex matches.
  const extractionPreview = useMemo<{ source: string; extracted: string; captureStart: number; captureEnd: number } | null>(() => {
    if (attribute.isConstant) return null;
    if (!transactions || transactions.length === 0) return null;
    if (!attribute.sourceField || !attribute.extractionOperation) return null;
    try {
      const rebuilt = regexifyExtraction(attribute.extractionOperation, extractionParams);
      const regexStr = attribute._originalRegex || rebuilt;
      if (!regexStr) return null;
      const regex = new RegExp(regexStr);
      for (const row of transactions) {
        const fieldValue = row[attribute.sourceField];
        if (fieldValue === undefined || fieldValue === null) continue;
        const rawStr = stringifyFieldValue(attribute.sourceField, fieldValue);
        if (!rawStr) continue;
        // Apply the pre-extraction pipeline before the regex sees the
        // value so the "Extracted" preview matches what the saved rule
        // will compute. `source` carries the post-pre value so the
        // preview row reads honest end-to-end.
        const str = applyPreExtraction(rawStr);
        const match = str.match(regex);
        // Mirror rawDistinctValues: fall back to match[0] when the pattern
        // has no explicit capture group (lookahead-style extractions).
        const captured = match ? (match[1] ?? match[0]) : undefined;
        if (match && captured) {
          // Locate the captured span within the source so the preview can
          // highlight it. The captured group is a contiguous substring of the
          // match; offset = match start + the group's position inside match[0]
          // (0 when there's no explicit group). Avoids the `d`-flag indices
          // API so it stays within the ES2020 lib types.
          const matchIndex = match.index ?? 0;
          const within = match[1] != null ? match[0].indexOf(match[1]) : 0;
          const captureStart = matchIndex + (within >= 0 ? within : 0);
          return { source: str, extracted: captured, captureStart, captureEnd: captureStart + captured.length };
        }
      }
      return null;
    } catch {
      return null;
    }
  }, [
    transactions,
    attribute.sourceField,
    attribute.extractionOperation,
    attribute.isConstant,
    attribute._originalRegex,
    extractionParams,
    applyPreExtraction,
  ]);

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
  //
  // When the operator has configured a chain that touches a specific
  // substring (replace's `find`, regex_replace's `pattern`, split_and_pick's
  // `delimiter`), prefer a raw value that actually contains/matches it so
  // the preview demonstrates the transformation instead of showing a
  // misleading no-op. Falls back to rawDistinctValues[0] if no candidate
  // exists.
  const transformationSample = useMemo(() => {
    const txs = attribute.transformations ?? [];
    if (rawDistinctValues.length > 0) {
      // Match check has to be done at each step against the value AS IT
      // ENTERS that step — earlier transformations (trim, replace, etc.)
      // can change shape before the matcher step runs. Without this,
      // a chain like [trim, starts_with_and_replace("FAVOR", …)] on
      // " FAVOR …" would fail the match check (raw has a leading space)
      // and the picker would fall back to a non-demonstrating sample,
      // making the preview's last step look like a misleading no-op.
      const demonstrates = (raw: string): boolean => {
        let current = raw;
        for (const t of txs) {
          if (t.method === 'replace') {
            const find = t.args.find;
            if (find && current.includes(find)) return true;
          } else if (t.method === 'regex_replace') {
            const pattern = t.args.pattern;
            if (pattern) {
              try { if (new RegExp(pattern).test(current)) return true; } catch { /* skip */ }
            }
          } else if (t.method === 'split_and_pick') {
            const delim = t.args.delimiter;
            if (delim && current.includes(delim)) return true;
          } else if (t.method === 'starts_with_and_replace') {
            const prefix = t.args.prefix;
            if (prefix && current.startsWith(prefix)) return true;
          } else if (t.method === 'ends_with_and_replace') {
            const suffix = t.args.suffix;
            if (suffix && current.endsWith(suffix)) return true;
          }
          current = applyTransformation(t.method, t.args, current);
        }
        return false;
      };
      const meaningful = rawDistinctValues.find(demonstrates);
      if (meaningful !== undefined) return meaningful;
      return rawDistinctValues[0];
    }
    if (!transactions || !attribute.sourceField) return undefined;
    for (const row of transactions) {
      const val = row[attribute.sourceField];
      if (val !== undefined && val !== null) {
        const s = stringifyFieldValue(attribute.sourceField, val);
        if (s.trim()) return s;
      }
    }
    return undefined;
  }, [rawDistinctValues, transactions, attribute.sourceField, attribute.transformations]);

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
      const match = stringifyFieldValue(attribute.sourceField, fieldValue).match(regex);
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
            if (regex.test(stringifyFieldValue(attribute.sourceField, fieldValue))) passed++;
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

  // Per-value validity for the "See all distinct values" popup. Returns
  //   true  → matches the active validation rule
  //   false → does not match
  //   null  → no rule configured for this attribute (renders no icon)
  // Mirrors the validation gates used by `validationSummary` above:
  //   * `extract_between_and_verify` validates against `verifyValue`
  //   * predefined patterns with `validate: true` validate their own regex
  //   * a ValidationClass (`validationRuleTag`) validates its regex
  const validateValue = useMemo(() => {
    if (attribute.extractionOperation === 'extract_between_and_verify' && attribute.verifyValue) {
      const verify = attribute.verifyValue;
      return (val: string): boolean | null => val === verify;
    }
    if (attribute.extractionOperation.startsWith('predefined:')) {
      const predefined = PREDEFINED_PATTERNS.find((p) => p.key === attribute.extractionOperation);
      if (predefined?.validate) {
        try {
          const r = new RegExp(predefined.regex);
          return (val: string): boolean | null => r.test(val);
        } catch {
          return () => null;
        }
      }
    }
    const vc = validationClasses.find((c) => c.Tag === attribute.validationRuleTag);
    if (vc?.Regex) {
      try {
        const r = new RegExp(vc.Regex);
        return (val: string): boolean | null => r.test(val);
      } catch {
        return () => null;
      }
    }
    return (): boolean | null => null;
  }, [attribute.extractionOperation, attribute.verifyValue, attribute.validationRuleTag, validationClasses]);

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
                {attribute.isConstant ? (
                  <span className="ml-1.5 text-orange-500 dark:text-orange-300">{preview}</span>
                ) : attribute.sourceField && (
                  <>
                    <span className="text-faint mx-1.5">&mdash;</span>
                    <span className="text-primary italic">
                      {humanizeFieldName(attribute.sourceField)} &rarr; <span className="text-orange-500 dark:text-orange-300">{preview}</span>
                    </span>
                  </>
                )}
                {!attribute.isConstant && (attribute.transformations?.length ?? 0) > 0 && (
                  <span className="text-purple-400 ml-1.5 text-[10px]">
                    +{attribute.transformations!.length} transform{attribute.transformations!.length > 1 ? 's' : ''}
                  </span>
                )}
              </p>
            </div>
            {libraryId && attribute.attributeTag && (
              <WizardCommentIconButton
                formKey={attribute.id}
                kind="attribute"
                targetLabel={attribute.attributeTag}
                persistedTarget={
                  definitionId
                    ? {
                        TagSpecLibraryId: libraryId,
                        TagSpecDefinitionId: definitionId,
                        AttributeTag: attribute.attributeTag,
                      }
                    : null
                }
                size="xs"
              />
            )}
            {attribute.attributeTag.trim().length > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={handleViewAttrColumn}
                className="text-primary shrink-0"
                title="Scroll the transactions table to this attribute's column"
              >
                View Attr Column
              </Button>
            )}
            {!readOnly && (
              <Button variant="ghost" size="xs" onClick={onClone} className="text-primary shrink-0">
                Clone Attribute
              </Button>
            )}
            {!readOnly && (
              <Button variant="ghost" size="xs" onClick={onRemove} className="text-red-400 hover:text-red-500 shrink-0">
                Remove Attribute
              </Button>
            )}
          </div>

          {/* Attribute Name */}
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <SearchableSelect
                label="Attribute Name"
                value={attribute.attributeTag}
                onChange={(val) => {
                  // Re-picking the same name is a no-op so we don't blow away
                  // a half-filled row just because the operator clicked the
                  // current selection.
                  if (val === attribute.attributeTag) return;
                  const backend = activeAttributes.find((a) => a.Value === val);
                  // Two distinct flows land here. The right signal isn't the
                  // previous *name* (cloneAttribute deliberately blanks the
                  // name on the clone so the operator picks a new one) but
                  // whether the row already carries meaningful config:
                  //   1. FRESH ROW (no source field, no extraction op, no
                  //      transformations, no constant value, no LOV) — the
                  //      row was just added via "+ Add Attribute" and has
                  //      nothing worth preserving. Seed defaults and apply
                  //      any backend LOV suggestion as a hint.
                  //   2. POPULATED ROW (any of those fields is set) — comes
                  //      from Clone, from a mid-edit name change, or from
                  //      having borrowed an extraction config via the
                  //      Suggestions modal. The operator's input belongs to
                  //      them, not the system. Wiping it on every rename
                  //      destroyed cloned config, which is the bug this
                  //      branch fixes. Update the name only.
                  // `id` is preserved in both flows so React keys stay stable.
                  const hasConfig =
                    !!attribute.sourceField
                    || !!attribute.extractionOperation
                    || (attribute.transformations?.length ?? 0) > 0
                    || !!attribute.isConstant
                    || !!attribute.isLovBased
                    || !!attribute.lovTag
                    || !!attribute.validationRuleTag;
                  if (hasConfig) {
                    onUpdate({ attributeTag: val });
                    return;
                  }
                  const updates: Partial<AttributeFormValue> = {
                    attributeTag: val,
                    isMandatory: false,
                    validationRuleTag: '',
                    sourceField: '',
                    extractionOperation: '' as AttributeFormValue['extractionOperation'],
                    prefix: '',
                    suffix: '',
                    pattern: undefined,
                    verifyValue: undefined,
                    numChars: undefined,
                    toStr: undefined,
                    occurrence: undefined,
                    startingPosition: undefined,
                    fromPosition: undefined,
                    toStart: undefined,
                    tillEndOfInput: undefined,
                    prefixOccurrence: undefined,
                    suffixOccurrence: undefined,
                    suffixOrEndOfInput: undefined,
                    isConstant: false,
                    constantValue: undefined,
                    isLovBased: false,
                    lovTag: null,
                    transformations: [],
                    _originalRegex: undefined,
                  };
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
            </div>
            {!readOnly && configSuggestions && configSuggestions.length > 0 && (
              <Tooltip
                content={`Reuse an extraction config from ${configSuggestions.length} other definition(s) in this bank`}
                placement="top"
              >
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setConfigSuggestionsOpen(true)}
                  className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5"
                  data-tour="attribute-config-suggestions"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Suggestions
                  <span className="text-[10px] font-semibold bg-primary/15 text-primary-dark dark:text-primary-light rounded-full px-1.5 py-0.5">
                    {configSuggestions.length}
                  </span>
                </Button>
              </Tooltip>
            )}
          </div>

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
                  // Mutex: turning on LOV mode clears constant mode.
                  onUpdate({ isLovBased: true, lovTag: attribute.lovTag || suggestedLov, isConstant: false });
                } else {
                  onUpdate({ isLovBased: false, lovTag: null });
                }
              }}
              disabled={readOnly}
            />
            <Toggle
              label="Is Constant"
              size="lg"
              checked={attribute.isConstant ?? false}
              onChange={(checked) => {
                if (checked) {
                  // Mutex: turning on constant mode clears LOV mode (and its tag).
                  // Don't auto-clear constantValue when turning off, so the user
                  // can flip back and forth without losing the value.
                  onUpdate({ isConstant: true, isLovBased: false, lovTag: null });
                } else {
                  onUpdate({ isConstant: false });
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

          {/* ── Constant Value (alternative to Extraction/Transformations/Validations) ── */}
          {attribute.isConstant && (
            <div className="border-t border-border-subtle pt-3 space-y-2">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">Constant Value</p>
              <p className="text-xs text-body-secondary">
                The text below will be set as this attribute&apos;s value on every matching transaction. No extraction or transformation is performed.
              </p>
              <Input
                label="Value"
                placeholder={readOnly ? '' : 'Required'}
                required={!readOnly}
                error={!readOnly && (attribute.constantValue ?? '').trim().length === 0}
                value={attribute.constantValue ?? ''}
                onChange={(e) => onUpdate({ constantValue: e.target.value })}
                disabled={readOnly}
              />
            </div>
          )}

          {!attribute.isConstant && (<>
          {/* ── Extraction ── */}
          <div className="border-t border-border-subtle pt-3 space-y-2">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">Extraction</p>
            {/* Layout note: Source Field, Pre-extraction Transformations, and
                Extraction Method used to live in a single `grid-cols-2` row
                with Source Field + Method side by side. The pre-section
                wedges in BETWEEN them now so the editor reads top-to-bottom
                in pipeline order (raw → pre → extract → post). Each input
                is in its own row so the pre-section can intervene cleanly. */}
            <div id="attribute_edit_1">
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
            </div>

            {/* ── Pre-extraction Transformations ──
                Renders only after the operator has picked a source field
                (mirrors the post-section's gating) AND skipped in
                read-only views where the operator hasn't configured any
                pre-steps. The `sampleValue` is the raw stringified source
                field value, so the preview shows
                  Raw → step 1 → step 2 → …
                which the operator then sees feeding into the extraction
                regex below via the standard extraction preview. */}
            {!!attribute.sourceField && !(readOnly && (attribute.preExtractionTransformations ?? []).length === 0) && (
              <div className="pt-1">
                <TransformationList
                  transformations={attribute.preExtractionTransformations ?? []}
                  methods={transformationMethods}
                  sampleValue={rawSourceSample}
                  onChange={(preExtractionTransformations) => onUpdate({ preExtractionTransformations })}
                  readOnly={readOnly}
                  variant="pre"
                  characterView={characterView}
                />
              </div>
            )}

            <div>
              {/* Custom label row so the "+ Extract Full Field" shortcut can
                  sit on the label line (like the transformation sections'
                  action links). One click sets the whole-field extraction
                  without hunting for it in the method dropdown. */}
              <div className="flex items-center justify-between mb-1 pl-1">
                <label className="text-xs font-medium text-body">
                  Extraction Method
                  {!readOnly && <span className="text-red-500 dark:text-rose-300 ml-0.5">*</span>}
                </label>
                {!readOnly && attribute.extractionOperation !== 'extract_full_field' && (
                  <button
                    type="button"
                    onClick={() => onUpdate({
                      extractionOperation: 'extract_full_field',
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
                    className="text-[11px] text-primary hover:text-primary-dark hover:underline"
                  >
                    + Extract Full Field
                  </button>
                )}
              </div>
              <SearchableSelect
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
                // The "or end of input" boundary toggle is only meaningful for
                // Extract between (where the suffix sits between prefix and the
                // rest). Extract before captures from the start up to the
                // suffix, so the toggle was removed there per product decision.
                const showEoiToggle = selectedOp.key !== 'extract_before';
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
                    {showEoiToggle && eoiLiteral !== null && !readOnly && (
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
                    {showEoiToggle && (
                      <label className={`flex items-center gap-1.5 text-xs text-body-secondary pl-1 select-none ${readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={!!attribute.suffixOrEndOfInput}
                          onChange={(e) => onUpdate({ suffixOrEndOfInput: e.target.checked || undefined })}
                          disabled={readOnly}
                        />
                        or end of input
                      </label>
                    )}
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
                // Occurrence is 1-based — "no value" and "1" both mean the first
                // occurrence, and the two can't be told apart in older saved
                // regexes (occurrence 1 left no marker). Default the DISPLAY to
                // "1" (not the stored value, so we don't bloat every regex with
                // a {0} marker on re-save) so those attributes reload as 1
                // instead of blank.
                <SearchableSelect
                  label="Occurrence"
                  placeholder="1"
                  value={attribute.occurrence ? String(attribute.occurrence) : '1'}
                  onChange={(val) => onUpdate({ occurrence: val ? Number(val) : undefined })}
                  options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                  disabled={readOnly}
                />
              )}
              {filteredOp.optionalFields.includes('prefixOccurrence') && (
                <SearchableSelect
                  label="Prefix Occurrence"
                  placeholder="1"
                  value={attribute.prefixOccurrence ? String(attribute.prefixOccurrence) : '1'}
                  onChange={(val) => onUpdate({ prefixOccurrence: val ? Number(val) : undefined })}
                  options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                  disabled={readOnly}
                />
              )}
              {filteredOp.optionalFields.includes('suffixOccurrence') && (
                <SearchableSelect
                  label="Suffix Occurrence"
                  placeholder="1"
                  value={attribute.suffixOccurrence ? String(attribute.suffixOccurrence) : '1'}
                  onChange={(val) => onUpdate({ suffixOccurrence: val ? Number(val) : undefined })}
                  options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                  disabled={readOnly}
                />
              )}
            </div>
          )}
          </div>

          {/* ── Extraction Preview ── */}
          {/* One source / extracted pair from the loaded transactions sample
              so the operator can sanity-check the regex against real data
              before adding transformations on top. Renders only when the
              regex matches at least one row in the sample; absent state is
              quiet by design so a brand-new attribute that hasn't picked an
              extraction method yet doesn't show an empty box. No top
              border / padding — the preview is part of the Extraction
              block visually, not a separate section. */}
          {extractionPreview && (() => {
            // The per-character breakdown follows the global "Character view"
            // toggle (same one that drives the table): on + RTL sample → show
            // it; off → normal preview only.
            const showBreakdown = characterView && containsRtl(extractionPreview.source);
            const captureRange = { start: extractionPreview.captureStart, end: extractionPreview.captureEnd };
            return (
              <div className="rounded-lg border border-border bg-surface-secondary p-2.5 space-y-1 mt-2">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1.5">
                  Extraction Preview
                </p>
                <div className="flex items-start gap-2 text-xs">
                  <span className="shrink-0 w-5 text-right text-faint font-mono">&bull;</span>
                  <span className="text-faint text-[10px] shrink-0 w-20">Source</span>
                  <HighlightedText
                    text={extractionPreview.source}
                    highlight={captureRange}
                    className="font-mono text-body-secondary break-all whitespace-pre-wrap"
                  />
                </div>
                <div className="flex items-start gap-2 text-xs">
                  <span className="shrink-0 w-5 text-right text-faint font-mono">&rarr;</span>
                  <span className="text-orange-500 dark:text-orange-300 text-[10px] shrink-0 w-20">Extracted</span>
                  <code dir="auto" className="font-mono text-primary break-all whitespace-pre-wrap">"{extractionPreview.extracted}"</code>
                </div>
                {showBreakdown && (
                  <CharacterBreakdown
                    text={extractionPreview.source}
                    highlight={captureRange}
                    className="mt-1.5"
                  />
                )}
              </div>
            );
          })()}

          {/* ── Post-extraction Transformations ── */}
          {!!attribute.sourceField && !(readOnly && (attribute.transformations ?? []).length === 0) && (
            <div className="border-t border-border-subtle pt-3">
              <TransformationList
                transformations={attribute.transformations ?? []}
                methods={transformationMethods}
                sampleValue={transformationSample}
                onChange={(transformations) => onUpdate({ transformations })}
                readOnly={readOnly}
                characterView={characterView}
              />
            </div>
          )}

          {/* ── Validations ── */}
          {!(readOnly && !showValidation) && (
            <div className="border-t border-border-subtle pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">Validations</p>
                {!showValidation && !readOnly && (
                  <div className="flex items-center gap-2">
                    {/* Shortcut for the most common validation class — sets
                        validationRuleTag = 'STRING' and reveals the picker
                        already populated, saving the dropdown round-trip.
                        Gated on the catalog actually offering a STRING
                        option so a deployment with a different class list
                        doesn't render a button that picks an unknown
                        value. */}
                    {validationRuleOptions.some((o) => o.value === 'STRING') && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          onUpdate({ validationRuleTag: 'STRING' });
                          setShowValidation(true);
                        }}
                        title="Add a String validation"
                      >
                        + Add String Validation
                      </Button>
                    )}
                    <Button variant="ghost" size="xs" onClick={() => setShowValidation(true)}>
                      + Add Validation
                    </Button>
                  </div>
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

          </>)}

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
        // Wraps instead of clipping: on a narrow attributes column the action
        // cluster (Mandatory + distinct/comment/view/clone/remove) flows onto a
        // second line rather than overflowing the card. The summary keeps a
        // readable min width so the attribute name never squishes to nothing.
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 min-w-0">
          <div
            className="flex-1 min-w-48 cursor-pointer hover:bg-surface-hover rounded px-2 py-1.5 transition-colors flex items-center gap-1.5"
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
          <div className="flex items-center gap-1 flex-wrap justify-end ml-auto">
            {/* Mandatory toggle surfaced on the collapsed row so operators can
                flip it without expanding the whole attribute editor. Writes
                straight to the attribute \u2014 it's a saved flag, no snapshot
                needed. Shown disabled (state still visible) in read-only. */}
            <Toggle
              label="Mandatory"
              size="sm"
              checked={attribute.isMandatory}
              onChange={(checked) => onUpdate({ isMandatory: checked })}
              disabled={readOnly}
            />
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
            {libraryId && attribute.attributeTag && (
              <WizardCommentIconButton
                formKey={attribute.id}
                kind="attribute"
                targetLabel={attribute.attributeTag}
                persistedTarget={
                  definitionId
                    ? {
                        TagSpecLibraryId: libraryId,
                        TagSpecDefinitionId: definitionId,
                        AttributeTag: attribute.attributeTag,
                      }
                    : null
                }
                size="xs"
              />
            )}
            {attribute.attributeTag.trim().length > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={handleViewAttrColumn}
                className="ml-1 text-primary"
                title="Scroll the transactions table to this attribute's column"
              >
                View Attr Column
              </Button>
            )}
            {!readOnly && (
              <Button variant="ghost" size="xs" onClick={onClone} className="ml-1 text-primary">
                Clone Attribute
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
        // English details (LOV item Description) by value; primary label, with
        // fallback to the raw extracted value when no Description is defined.
        const lovMap = attribute.isLovBased && attribute.lovTag ? lovDescriptionLookup.get(attribute.lovTag) : undefined;
        return (
          <Modal open onClose={() => setShowDistinct(false)} title={`Distinct values for "${attribute.attributeTag || 'Attribute'}"`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                Showing distinct extracted values from the transactions currently loaded on this page.
              </p>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setShowBackendDistinct(true)}
              >
                Show all from dataset
              </Button>
            </div>
            <div className="space-y-1">
              {distinctValues.map((val, i) => {
                const resolved = lovMap?.get(val);
                const isValid = validateValue(val);
                return (
                  <div key={i} className="px-3 py-1.5 text-sm font-mono bg-surface-secondary rounded border border-border dark:text-primary-light flex items-center gap-2">
                    {isValid === true && (
                      <Tooltip placement="top" content="Passes the active validation rule">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex-shrink-0">
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                            <path d="M3 8.5L6.5 12L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </Tooltip>
                    )}
                    {isValid === false && (
                      <Tooltip placement="top" content="Fails the active validation rule">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 flex-shrink-0">
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                            <path d="M4 4L12 12M12 4L4 12" strokeLinecap="round" />
                          </svg>
                        </span>
                      </Tooltip>
                    )}
                    <span dir="auto" className="flex-1 min-w-0 truncate">
                      {resolved ? <>{resolved} <span className="text-faint text-xs">({val})</span></> : val}
                    </span>
                  </div>
                );
              })}
            </div>
          </Modal>
        );
      })()}

      {showBackendDistinct && (
        <DistinctValuesModal
          open
          onClose={() => setShowBackendDistinct(false)}
          attributeName={attribute.attributeTag || 'Attribute'}
          attributeTag={attribute.attributeTag}
          sourceField={attribute.sourceField}
          definitionId={definitionId}
          tagSpecKind={tagSpecKind}
          descriptionMap={attribute.isLovBased && attribute.lovTag ? lovDescriptionLookup.get(attribute.lovTag) : undefined}
        />
      )}

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

      {configSuggestionsOpen && configSuggestions && (
        <AttributeConfigSuggestionsModal
          open
          attributeTag={attribute.attributeTag}
          suggestions={configSuggestions}
          onClose={() => setConfigSuggestionsOpen(false)}
          onApply={(picked) => {
            // Preserve the row's identity + the operator's stated intent
            // (attribute name + Mandatory flag); overwrite everything that
            // describes HOW the value is extracted from the source field.
            // _originalRegex is intentionally dropped — keeping it would
            // mask the freshly-applied extraction params on save.
            onUpdate({
              sourceField: picked.sourceField,
              extractionOperation: picked.extractionOperation,
              prefix: picked.prefix,
              suffix: picked.suffix,
              pattern: picked.pattern,
              suffixOrEndOfInput: picked.suffixOrEndOfInput,
              numChars: picked.numChars,
              fromPosition: picked.fromPosition,
              tillEndOfInput: picked.tillEndOfInput,
              verifyValue: picked.verifyValue,
              isConstant: picked.isConstant ?? false,
              constantValue: picked.constantValue,
              isLovBased: picked.isLovBased ?? false,
              lovTag: picked.lovTag ?? null,
              validationRuleTag: picked.validationRuleTag,
              transformations: (picked.transformations ?? []).map((t) => ({
                id: crypto.randomUUID(),
                method: t.method,
                args: { ...t.args },
              })),
              _originalRegex: undefined,
            });
          }}
        />
      )}
    </div>
  );
}
