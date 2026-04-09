import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useAuth } from '../../context/AuthContext';
import { useTransactionData } from '../../hooks/useTransactionData';
import type { FilterProperty } from '../../api/transactions';
import { useWizardForm, fromExistingDefinition } from '../../hooks/useWizardForm';
import type { TagSpecDefinition, TagSpecLibrary, AnalyzedTransaction, WizardFormState, RuleExpression, CheckoutState } from '../../types';
import type { WizardFormResult } from '../../hooks/useWizardForm';
import { analyzeRow } from '../../utils/analyzeRow';
import { regexify, regexifyExtraction, generateExpressionPrompt, generateExtractionPrompt } from '../../utils/regexify';
import { generateExpressionId } from '../../utils/uuid';
import { getContextValue } from '../../types/tagSpec';
import { TransactionTable, ColumnPicker, ALLOWED_COLUMN_KEYS, type ColumnDef } from './TransactionTable';
import { StepRuleExpressions } from '../wizard/StepRuleExpressions';
import { StepAttributes } from '../wizard/StepAttributes';
import { TagWizardModal } from '../wizard/TagWizardModal';
import { Button } from '../shared/Button';
import { Toast } from '../shared/Toast';
import { Tooltip } from '../shared/Tooltip';
import { DynamicFilters } from './DynamicFilters';
import { Toggle } from '../shared/Toggle';
import { useLocalChanges } from '../../hooks/useLocalChanges';
import { EmptyState } from '../shared/EmptyState';
import { TransactionTypePicker } from '../shared/TransactionTypePicker';
import { tagSpecLibrarySave } from '../../api/tagSpecSave';
import { useTepConfig } from '../../context/TepConfigContext';
import type { TepHeaders } from '../../api/transactions';

interface TransactionsTabProps {
  activeCheckout?: CheckoutState | null;
  onClearPendingDefinition?: () => void;
  onCheckin?: (bank: string, side: string) => void;
  onRelease?: (bank: string, side: string) => void;
  onRequestUndo?: (bank: string, side: string) => void;
}

function formStateToTempDefinition(formState: WizardFormState): TagSpecDefinition | null {
  const hasCondition = formState.ruleGroups.some((g) =>
    g.conditions.some((c) => c.value.trim().length > 0)
  );
  const hasAttribute = formState.attributes.some((a) => a.attributeTag.trim().length > 0);
  if (!hasCondition && !hasAttribute) return null;

  const id = 'preview-temp';
  return {
    Id: id,
    Tag: 'Preview',
    Context: [], // Empty context — matches all rows for preview
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'MEDIUM',
    Validity: {
      StartDate: '2000-01-01',
      EndDate: null,
    },
    TagRuleExpressions: formState.ruleGroups.map((group) =>
      group.conditions
        .filter((c) => c.value.trim().length > 0)
        .map((c) => {
          const prompt = generateExpressionPrompt(c.operation, c.value, c.values);
          return {
            SourceField: c.sourceField,
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexify(c.operation, c.value, c.values),
            RegexDetails: [{ LanguageCode: 'en', Description: prompt }],
          };
        })
    ).filter((group) => group.length > 0),
    Attributes: formState.attributes
      .filter((a) => a.attributeTag.trim().length > 0)
      .map((attr, index) => {
        const params = {
          prefix: attr.prefix,
          suffix: attr.suffix,
          pattern: attr.pattern,
          numChars: attr.numChars,
          toStr: attr.toStr,
          toStart: attr.toStart,
          occurrence: attr.occurrence,
          startingPosition: attr.startingPosition,
          fromPosition: attr.fromPosition,
          prefixOccurrence: attr.prefixOccurrence,
          suffixOccurrence: attr.suffixOccurrence,
        };
        const prompt = generateExtractionPrompt(attr.extractionOperation, params);
        return {
          AttributeTag: attr.attributeTag,
          IsMandatory: attr.isMandatory,
          LOVTag: attr.isLovBased ? (attr.lovTag ?? null) : null,
          ValidationRuleTag: attr.validationRuleTag,
          AttributeRuleExpression: {
            SourceField: attr.sourceField,
            ExpressionPrompt: null,
            ExpressionId: generateExpressionId(id, 'attr', index),
            Regex: regexifyExtraction(attr.extractionOperation, params),
            RegexDetails: [{ LanguageCode: 'en', Description: prompt }],
          },
          ...((attr.transformations && attr.transformations.length > 0)
            ? {
                Transformations: attr.transformations.map((t, tIdx) => ({
                  Method: t.method,
                  Args: { ...t.args },
                  Order: tIdx + 1,
                })),
              }
            : {}),
        };
      }),
  };
}

const BATCH_SIZE = 50;

/** Build the FilterProperty[] payload for Call 3 (Apply Rules) from the builder form state. */
function buildRulesetFilters(formState: WizardFormState): FilterProperty[] {
  const filters: FilterProperty[] = [
    { ColumnName: 'BankSwiftCode', Value: formState.bankSwiftCode, Operand: 'IN' },
    { ColumnName: 'Side', Value: formState.side, Operand: 'IN' },
    { ColumnName: 'TransactionTypeCode', Value: formState.transactionTypeCode, Operand: 'EQ' },
  ];

  const regexGroups = formState.ruleGroups
    .map(group =>
      group.conditions
        .filter(c => c.value.trim().length > 0)
        .map(c => ({ ColumnName: c.sourceField, Value: c.value, Options: '' }))
    )
    .filter(group => group.length > 0);

  if (regexGroups.length > 0) {
    filters.push({ Operand: 'REGEX', Regex: regexGroups });
  }

  return filters;
}

export function TransactionsTab({ activeCheckout, onClearPendingDefinition }: TransactionsTabProps) {
  const { libraries, tagDefinitions, originalDefinitionIds, dispatch } = useTagSpecs();
  const { userId, usersMap, getAuthHeaders, refreshIfNeeded } = useAuth();
  const tepConfig = useTepConfig();
  const { saveBaseline, updateCurrent } = useLocalChanges(activeCheckout?.bank, activeCheckout?.side);

  // Determine if the current user is NOT the checkout owner (read-only mode)
  const { isReadOnly, ownerName } = useMemo(() => {
    if (!activeCheckout) return { isReadOnly: true, ownerName: null };
    const inProgressLib = libraries.find(
      (l) =>
        l.StatusTag === 'INPROGRESS' &&
        getContextValue(l.Context, 'BankSwiftCode') === activeCheckout.bank &&
        getContextValue(l.Context, 'Side') === activeCheckout.side
    );
    if (!inProgressLib || !inProgressLib.OperatorId) return { isReadOnly: true, ownerName: null };
    const owned = inProgressLib.OperatorId === userId;
    const name = !owned ? (usersMap.get(inProgressLib.OperatorId) ?? inProgressLib.OperatorId) : null;
    return { isReadOnly: !owned, ownerName: name };
  }, [activeCheckout, libraries, userId, usersMap]);

  // Persist INPROGRESS library to localStorage whenever definitions change
  const inProgressLib = useMemo(() => {
    if (!activeCheckout) return null;
    return libraries.find(
      (l) =>
        l.StatusTag === 'INPROGRESS' &&
        getContextValue(l.Context, 'BankSwiftCode') === activeCheckout.bank &&
        getContextValue(l.Context, 'Side') === activeCheckout.side
    ) ?? null;
  }, [libraries, activeCheckout]);

  useEffect(() => {
    if (inProgressLib && activeCheckout) {
      const baselineKey = `tep:baseline:${activeCheckout.bank}:${activeCheckout.side}`;
      if (!localStorage.getItem(baselineKey)) {
        saveBaseline(inProgressLib);
      } else {
        updateCurrent(inProgressLib);
      }
    }
  }, [inProgressLib, activeCheckout, saveBaseline, updateCurrent]);

  const {
    transactions, fieldMeta, loadTransactions, resetToSample, isCustomData, flagDeadEnd,
    isLiveMode, loading, hasMore: liveHasMore, totalTransactionsCount, fetchPage, fetchCount,
    filterDefinitions, filterDefinitionsLoading, fetchFilterDefinitions,
    decimalMaxValues, fetchDecimalMaxValues,
  } = useTransactionData();
  // Fetch filter definitions when the Transactions tab mounts
  useEffect(() => {
    if (isLiveMode && filterDefinitions.length === 0) {
      fetchFilterDefinitions();
    }
  }, [isLiveMode, fetchFilterDefinitions, filterDefinitions.length]);
  // Probe the true max value for each DECIMAL filter once definitions are loaded
  useEffect(() => {
    if (isLiveMode && filterDefinitions.length > 0) {
      fetchDecimalMaxValues(filterDefinitions);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveMode, filterDefinitions.length]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rule builder state (reuses the wizard form hook)
  const builder = useWizardForm(undefined, undefined, fieldMeta.sourceFields[0]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const builderRef = useRef<HTMLDivElement>(null);
  const [builderHeight, setBuilderHeight] = useState(0);
  const [showOnlyUntagged, setShowOnlyUntagged] = useState(false);
  const [showOnlyMultiTagged, setShowOnlyMultiTagged] = useState(false);
  const [showOnlyDeadEnd, setShowOnlyDeadEnd] = useState(false);
  const [showAttributes, setShowAttributes] = useState(() => {
    try { return localStorage.getItem('tep:showAttributes') === 'true'; } catch { return false; }
  });
  const [incrementalPagination, setIncrementalPagination] = useState(() => {
    try { const v = localStorage.getItem('tep:incrementalPagination'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  const [currentPage, setCurrentPage] = useState(0);
  const [pageInputValue, setPageInputValue] = useState('1');
  const [relaxedMode, setRelaxedMode] = useState(() => {
    try { const v = localStorage.getItem('tep:relaxedMode'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  const [hiddenColumns, setHiddenColumns] = useState<Set<string> | null>(() => {
    try {
      const stored = localStorage.getItem('tep:hiddenColumns');
      return stored ? new Set(JSON.parse(stored) as string[]) : null;
    } catch { return null; }
  });
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('tep:columnOrder');
      return stored ? JSON.parse(stored) as string[] : [];
    } catch { return []; }
  });
  const [tableColumns, setTableColumns] = useState<ColumnDef[]>([]);
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  // State for tag-click drill-down: tracks both definition-ID and tag-name queries
  const [tagClickState, setTagClickState] = useState<{
    preFilters: Record<string, Set<string>>;  // filters before tag click (restored on close)
    tagName: string;
    definitionId: string;
    tagNameCount: number | null;              // total count by tag name (null = loading)
    showingAll: boolean;                      // user clicked "show all" → switched to tag-name filter
    tagFilterKey: string;                     // the filter definition Tag key for the tag filter
    definitionTotalCount: number | null;      // Call 2 total count (stored before Call 3 overwrites)
    rulesetApplied: boolean;                  // whether user clicked "Apply Rules"
    rulesetFilters: FilterProperty[];         // REGEX-based filters for Call 3
    rulesetMatchCount: number | null;         // last confirmed REGEX match count (persists during re-loads)
    originalFormState: WizardFormState;       // builder state at tag-click time (for discard)
  } | null>(null);

  // Extra filters injected into API calls (definition-ID scoping, REGEX ruleset, or transaction type from builder)
  const activeExtraFilters: FilterProperty[] = useMemo(() => {
    if (tagClickState) {
      // After "Apply Rules": use REGEX-based filters (Call 3)
      if (tagClickState.rulesetApplied) {
        return tagClickState.rulesetFilters;
      }
      // Default tag-click mode: scope by definition ID (Call 2)
      if (!tagClickState.showingAll) {
        return [{
          ColumnName: 'OpsTagSpecDefinitionId|OpsMultiTags.TagSpecDefinitionId',
          Value: tagClickState.definitionId,
          Operand: 'IN',
        }];
      }
      // "Show all" mode: keep TransactionTypeCode so the scope stays correct
      if (tagClickState.originalFormState.transactionTypeCode) {
        return [{ ColumnName: 'TransactionTypeCode', Value: tagClickState.originalFormState.transactionTypeCode, Operand: 'EQ' }];
      }
      return [];
    }
    const extra: FilterProperty[] = [];
    if (builderOpen && builder.formState.transactionTypeCode) {
      extra.push({ ColumnName: 'TransactionTypeCode', Value: builder.formState.transactionTypeCode, Operand: 'EQ' });
    }
    return extra;
  }, [tagClickState, builderOpen, builder.formState.transactionTypeCode]);

  // Persist settings to localStorage
  useEffect(() => { try { localStorage.setItem('tep:showAttributes', String(showAttributes)); } catch { /* ignore */ } }, [showAttributes]);
  useEffect(() => { try { localStorage.setItem('tep:incrementalPagination', String(incrementalPagination)); } catch { /* ignore */ } }, [incrementalPagination]);
  useEffect(() => { try { localStorage.setItem('tep:relaxedMode', String(relaxedMode)); } catch { /* ignore */ } }, [relaxedMode]);
  useEffect(() => { if (hiddenColumns !== null) { try { localStorage.setItem('tep:hiddenColumns', JSON.stringify([...hiddenColumns])); } catch { /* ignore */ } } }, [hiddenColumns]);
  useEffect(() => { try { localStorage.setItem('tep:columnOrder', JSON.stringify(columnOrder)); } catch { /* ignore */ } }, [columnOrder]);

  // Track builder panel height so the table can adjust its maxHeight
  useEffect(() => {
    const el = builderRef.current;
    if (!builderOpen || !el) { setBuilderHeight(0); return; }
    const ro = new ResizeObserver(([entry]) => setBuilderHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [builderOpen]);


  const defaultHiddenColumns = useMemo(() => {
    const s = new Set<string>();
    for (const col of tableColumns) {
      if (col.type === 'tags') continue;
      if (col.type === 'attribute') continue;
      if (ALLOWED_COLUMN_KEYS.has(col.key)) continue;
      s.add(col.key);
    }
    return s;
  }, [tableColumns]);

  // When hiddenColumns is null (no stored preference), use defaults
  const effectiveHiddenColumns = useMemo(() => hiddenColumns ?? defaultHiddenColumns, [hiddenColumns, defaultHiddenColumns]);

  const handleColumnReset = useCallback(() => {
    setHiddenColumns(defaultHiddenColumns);
    setColumnOrder([]);
  }, [defaultHiddenColumns]);

  // Base filters from checkout — "clear filters" resets to these instead of empty
  // In live mode, keys must match filter definition Tags (e.g. "BANKS", "SIDE")
  // rather than column names, so translateFilters can find the matching definition.
  const baseFilters = useMemo(() => {
    if (!activeCheckout) return undefined;
    if (isLiveMode && filterDefinitions.length > 0) {
      const tagForColumn = (col: string) =>
        filterDefinitions.find((d) => d.Values.some((v) => v.Column === col))?.Tag ?? col;
      return {
        [tagForColumn('BankSwiftCode')]: new Set([activeCheckout.bank]),
        [tagForColumn('Side')]: new Set([activeCheckout.side]),
      };
    }
    // Sample mode: use column names directly (client-side filtering)
    return {
      BankSwiftCode: new Set([activeCheckout.bank]),
      Side: new Set([activeCheckout.side]),
    };
  }, [activeCheckout, isLiveMode, filterDefinitions]);

  // Apply checkout filters when checkout state changes
  useEffect(() => {
    if (baseFilters) {
      setFilters({ ...baseFilters });
      setShowOnlyUntagged(false);
      setShowOnlyMultiTagged(false);
    }
  }, [baseFilters]);

  // Live mode: fetch from API when filters or extraFilters change
  useEffect(() => {
    if (!isLiveMode) return;
    const timer = setTimeout(() => {
      fetchPage(filters, false, incrementalPagination ? undefined : 0, undefined, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
      if (!incrementalPagination) { setCurrentPage(0); setPageInputValue('1'); }
    }, 50);
    return () => clearTimeout(timer);
  }, [isLiveMode, filters, fetchPage, incrementalPagination, activeExtraFilters]);

  // Capture Call 2 total count (definition-based) before Call 3 can overwrite it
  useEffect(() => {
    if (tagClickState && !tagClickState.showingAll && !tagClickState.rulesetApplied
        && tagClickState.definitionTotalCount === null && totalTransactionsCount != null) {
      setTagClickState(prev => prev ? { ...prev, definitionTotalCount: totalTransactionsCount } : prev);
    }
  }, [tagClickState, totalTransactionsCount]);

  // Capture confirmed REGEX match count after each Call 3 completes
  useEffect(() => {
    if (tagClickState?.rulesetApplied && !loading && totalTransactionsCount != null) {
      setTagClickState(prev =>
        prev?.rulesetApplied && prev.rulesetMatchCount !== totalTransactionsCount
          ? { ...prev, rulesetMatchCount: totalTransactionsCount }
          : prev
      );
    }
  }, [tagClickState?.rulesetApplied, loading, totalTransactionsCount]);

  // Ref to hold pending definition ID from Backlog navigation (one-shot)
  const pendingDefIdRef = useRef<string | null>(activeCheckout?.pendingDefinitionId ?? null);

  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInitialState, setWizardInitialState] = useState<WizardFormState | undefined>(undefined);
  const [editingDef, setEditingDef] = useState<TagSpecDefinition | undefined>(undefined);
  const [editingParentLib, setEditingParentLib] = useState<TagSpecLibrary | undefined>(undefined);
  const [wizardInitialStep, setWizardInitialStep] = useState<1 | 2 | 3 | 4 | undefined>(undefined);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [wizardFromCheckout, setWizardFromCheckout] = useState(false);

  // Build the temporary definition from the builder's form state
  const tempDefinition = useMemo(
    () => (builderOpen ? formStateToTempDefinition(builder.formState) : null),
    [builderOpen, builder.formState]
  );

  // When an INPROGRESS library exists, exclude its ACTIVE counterpart
  // so that only the in-progress definitions are used for analysis.
  const effectiveLibraries = useMemo(() => {
    const activeIdsWithInProgress = new Set(
      libraries.filter(l => l.StatusTag === 'INPROGRESS' && l.ActiveTagSpecLibId)
        .map(l => l.ActiveTagSpecLibId!)
    );
    return activeIdsWithInProgress.size > 0
      ? libraries.filter(l => !(l.StatusTag === 'ACTIVE' && l.Id && activeIdsWithInProgress.has(l.Id)))
      : libraries;
  }, [libraries]);

  // Combine real libraries + temp definition for analysis.
  // When editing an existing def, skip the preview — the original is already in libraries.
  // When creating a new def, append a synthetic preview library.
  const allLibraries: TagSpecLibrary[] = useMemo(() => {
    if (!tempDefinition || editingDef) return effectiveLibraries;

    const previewLib: TagSpecLibrary = {
      Id: 'preview-lib',
      ActiveTagSpecLibId: null,
      OperatorId: '',
      StatusTag: 'ACTIVE',
      DataSetType: 'MT940',
      Version: 1,
      IsLatestVersion: true,
      VersionDate: '',
      Context: [], // Empty context — matches all rows for preview
      TagSpecDefinitions: [tempDefinition],
    };
    return [...effectiveLibraries, previewLib];
  }, [effectiveLibraries, tempDefinition, editingDef]);

  // Flat definitions including preview (for table column ordering + LOV resolution)
  const allDefinitions = useMemo(() => {
    if (!tempDefinition) return tagDefinitions;
    if (editingDef) {
      // Replace the edited definition with the live temp version so the table
      // picks up LOV tag changes (isLovBased toggle) for real-time resolution.
      return [...tagDefinitions.filter(d => d.Id !== editingDef.Id), tempDefinition];
    }
    return [...tagDefinitions, tempDefinition];
  }, [tagDefinitions, tempDefinition, editingDef]);

  // Map definition ID → source label for tag tooltip
  const definitionSourceMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const lib of allLibraries) {
      const source = lib.StatusTag === 'ACTIVE' ? 'Backend Prod' : lib.StatusTag === 'INPROGRESS' ? 'Backend Ops' : 'Frontend';
      for (const def of lib.TagSpecDefinitions) {
        map.set(def.Id, source);
      }
    }
    return map;
  }, [allLibraries]);

  // Check if builder has any real content
  const builderHasContent = builder.formState.ruleGroups.some((g) =>
    g.conditions.some((c) => c.value.trim().length > 0)
  ) || builder.formState.attributes.some((a) => a.attributeTag.trim().length > 0);



  // Analyze all rows

  const analyzedData: AnalyzedTransaction[] = useMemo(
    () =>
      transactions.map((row) => ({
        row,
        analysis: analyzeRow(row, allLibraries, !!tempDefinition && !editingDef),
      })).filter(item => {
        if (!builderOpen || !builderHasContent) return true;
        // When tag click applied a server-side tag filter, skip client-side
        // definition matching — the server already scoped results to this tag.
        if (tagClickState !== null) return true;
        if (editingDef) return item.analysis.matchedDefinitions.some(d => d.Id === editingDef.Id);
        return item.analysis.tags.includes('Preview');
      }),
    [transactions, allLibraries, tempDefinition, editingDef, tagClickState, builderOpen, builderHasContent]
  );

  // Apply all filters
  const filteredData = useMemo(() => {
    let result = analyzedData;

    if (showOnlyUntagged) {
      result = result.filter((item) => item.analysis.tags.length === 0);
    }

    if (showOnlyMultiTagged) {
      result = result.filter((item) => item.analysis.tags.length > 1);
    }

    if (showOnlyDeadEnd) {
      result = result.filter((item) => item.row['IsDeadEnd'] === true);
    }

    for (const [field, selectedValues] of Object.entries(filters)) {
      if (selectedValues.size === 0) continue;
      if (field === '__tags') {
        result = result.filter((item) =>
          item.analysis.tags.some((tag) => selectedValues.has(tag))
        );
      } else if (!isLiveMode) {
        // In live mode, data-field filtering is handled server-side by the API
        result = result.filter((item) => {
          const val = item.row[field];
          return val !== null && val !== undefined && selectedValues.has(String(val));
        });
      }
    }

    // In sample mode, filter by transaction type when builder is open (live mode uses API extra filter)
    if (builderOpen && builder.formState.transactionTypeCode && !isLiveMode) {
      result = result.filter((item) => item.row['TransactionTypeCode'] === builder.formState.transactionTypeCode);
    }

    return result;
  }, [analyzedData, showOnlyUntagged, showOnlyMultiTagged, showOnlyDeadEnd, filters, isLiveMode, builderOpen, builder.formState.transactionTypeCode]);

  // Reset visible count / page when filtered data length changes
  // In live + classic pagination mode, data replaces on every page nav — don't reset page from here
  const filteredLen = filteredData.length;
  useEffect(() => {
    if (isLiveMode && !incrementalPagination) return; // page managed by nav controls + filter effect
    setVisibleCount(BATCH_SIZE);
    setCurrentPage(0);
    setPageInputValue('1');
  }, [filteredLen, isLiveMode, incrementalPagination]);

  const classicTotalPages = Math.max(1, Math.ceil((isLiveMode ? (totalTransactionsCount ?? filteredLen) : filteredLen) / BATCH_SIZE));

  const visibleData = useMemo(() => {
    if (builderOpen) return filteredData;
    if (isLiveMode) return filteredData;
    if (incrementalPagination) return filteredData.slice(0, visibleCount);
    const start = currentPage * BATCH_SIZE;
    return filteredData.slice(start, start + BATCH_SIZE);
  }, [filteredData, visibleCount, isLiveMode, incrementalPagination, currentPage, builderOpen]);

  const hasMore = isLiveMode ? liveHasMore : incrementalPagination ? visibleCount < filteredLen : false;

  // Flatten temp definition's rule expressions for highlighting
  const highlightExpressions: RuleExpression[] | undefined = useMemo(() => {
    if (!tempDefinition) return undefined;
    return tempDefinition.TagRuleExpressions.flat();
  }, [tempDefinition]);

  // Build search-filter highlight map: column → search string for active SEARCH filters
  const searchHighlights = useMemo(() => {
    const map = new Map<string, string>();
    for (const [key, values] of Object.entries(filters)) {
      if (values.size === 0) continue;
      const def = filterDefinitions.find((d) => d.Tag === key);
      if (!def || def.Type !== 'SEARCH') continue;
      const term = [...values][0];
      for (const v of def.Values) {
        if (!v.Column) continue;
        for (const col of v.Column.split('|')) {
          if (col) map.set(col, term);
        }
      }
    }
    return map.size > 0 ? map : undefined;
  }, [filters, filterDefinitions]);

  const handleCreateFromBuilder = useCallback(() => {
    const isFromCheckout = !!activeCheckout && !editingDef;
    const state: WizardFormState = {
      ...builder.formState,
      ...(isFromCheckout ? {
        side: activeCheckout!.side,
        bankSwiftCode: activeCheckout!.bank,
        transactionTypeCode: builder.formState.transactionTypeCode,
        validity: { StartDate: '', EndDate: null },
      } : {}),
    };
    setWizardInitialState(state);
    if (!editingDef) {
      setEditingDef(undefined);
      setEditingParentLib(undefined);
    }
    setWizardFromCheckout(isFromCheckout);
    setWizardInitialStep(undefined);
    setWizardOpen(true);
  }, [builder.formState, activeCheckout, editingDef]);

  const handleApplyRules = useCallback((formStateOverride?: WizardFormState) => {
    if (!tagClickState) return;
    const rulesetFilters = buildRulesetFilters(formStateOverride ?? builder.formState);
    // If we were in "show all" mode, restore preFilters so the tag name filter doesn't bleed into the REGEX call
    if (tagClickState.showingAll) {
      setFilters(tagClickState.preFilters);
    }
    setTagClickState(prev => prev ? {
      ...prev,
      definitionTotalCount: prev.definitionTotalCount ?? totalTransactionsCount,
      rulesetApplied: true,
      rulesetFilters,
      rulesetMatchCount: null,
      showingAll: false,
    } : prev);
  }, [tagClickState, builder.formState, totalTransactionsCount]);

  const handleDiscard = useCallback(() => {
    setBuilderOpen(false);
    setEditingDef(undefined);
    setEditingParentLib(undefined);
    builder.resetForm();
    // Restore filters from before tag click, ensuring base filters (bank/side) are always preserved
    if (tagClickState !== null) {
      setFilters({ ...baseFilters, ...tagClickState.preFilters });
      setTagClickState(null);
    }
  }, [builder, tagClickState, baseFilters]);

  const handleWizardSave = useCallback(async (result: WizardFormResult) => {
    if (editingDef) {
      dispatch({ type: 'UPDATE', payload: result });
      setToast({ message: `Tag '${result.definition.Tag}' updated`, type: 'success' });
    } else {
      dispatch({ type: 'ADD', payload: result });
      setToast({ message: `Tag '${result.definition.Tag}' created`, type: 'success' });
    }
    setWizardOpen(false);
    setWizardInitialState(undefined);
    setEditingDef(undefined);
    setEditingParentLib(undefined);
    setWizardInitialStep(undefined);
    setWizardFromCheckout(false);
    setBuilderOpen(false);
    builder.resetForm();
    if (tagClickState !== null) {
      setFilters({ ...baseFilters, ...tagClickState.preFilters });
      setTagClickState(null);
    }

    // Persist to API immediately
    if (activeCheckout) {
      try {
        await refreshIfNeeded();
        const authHeaders = getAuthHeaders();
        const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
        if (token) {
          const tepHeaders: TepHeaders = {
            apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
            userId: userId ?? '',
            tenantCode: tepConfig.ttpTenantCode,
            languageCode: tepConfig.languageCode,
            timeZone: tepConfig.timeZone,
            requestId: tepConfig.ttpRequestId,
          };
          // Find the inProgressLib and apply the change manually (dispatch is async in React batching)
          const currentLib = libraries.find(
            (l) =>
              l.StatusTag === 'INPROGRESS' &&
              getContextValue(l.Context, 'BankSwiftCode') === activeCheckout.bank &&
              getContextValue(l.Context, 'Side') === activeCheckout.side
          );
          if (currentLib) {
            const isEditing = !!editingDef;
            const updatedDefs = isEditing
              ? currentLib.TagSpecDefinitions.map((d) => d.Id === result.definition.Id ? result.definition : d)
              : [...currentLib.TagSpecDefinitions, result.definition];
            const libToSave = { ...currentLib, TagSpecDefinitions: updatedDefs };
            await tagSpecLibrarySave(libToSave, token, tepHeaders);
          }
        }
      } catch (err) {
        console.error('Failed to save tag spec library:', err);
      }
    }
  }, [dispatch, builder, editingDef, tagClickState, baseFilters, activeCheckout, libraries, refreshIfNeeded, getAuthHeaders, userId, tepConfig]);

  const handleWizardClose = useCallback(() => {
    setWizardOpen(false);
    setWizardInitialState(undefined);
    setEditingDef(undefined);
    setEditingParentLib(undefined);
    setWizardInitialStep(undefined);
    setWizardFromCheckout(false);
    setBuilderOpen(false);
    builder.resetForm();
    if (tagClickState !== null) {
      setFilters(tagClickState.preFilters);
      setTagClickState(null);
    }
  }, [builder, tagClickState]);

  // Click a tag badge in the table → load into rule builder for live editing
  // Primary call: filter by TagSpecDefinitionId (shows only transactions matched by this rule)
  // Background call: filter by tag name (to detect if other rules also produce this tag)
  const handleTagClick = useCallback((tagName: string, definitionId?: string) => {
    // Find the specific matched definition, preferring INPROGRESS libraries
    let foundDef: TagSpecDefinition | undefined;
    let foundLib: TagSpecLibrary | undefined;

    for (const lib of libraries) {
      const def = definitionId
        ? lib.TagSpecDefinitions.find((d) => d.Id === definitionId)
        : lib.TagSpecDefinitions.find((d) => d.Tag === tagName);
      if (def) {
        if (lib.StatusTag === 'INPROGRESS') { foundDef = def; foundLib = lib; break; }
        if (!foundDef) { foundDef = def; foundLib = lib; }
      }
    }

    if (foundDef && foundLib) {
      const formState = fromExistingDefinition(foundDef, foundLib);
      builder.setFormState(formState);
      setEditingDef(foundDef);
      setEditingParentLib(foundLib);
      setBuilderOpen(true);

      if (isLiveMode && filterDefinitions.length > 0 && foundDef.Id) {
        const tagFilterDef = filterDefinitions.find((d) =>
          d.Type === 'LIST' && d.Values.some((v) => v.Value === tagName)
        );
        const tagFilterKey = tagFilterDef?.Tag ?? '';

        // Save pre-click filters and set tag click state (don't modify filters — extraFilters handles the definition ID scoping)
        setTagClickState({
          preFilters: { ...filters },
          tagName,
          definitionId: foundDef.Id,
          tagNameCount: null, // loading
          showingAll: false,
          tagFilterKey,
          definitionTotalCount: null,
          rulesetApplied: false,
          rulesetFilters: [],
          rulesetMatchCount: null,
          originalFormState: formState,
        });

        // Primary: immediately fetch by definition ID (don't wait for the useEffect cycle)
        const defIdFilter: FilterProperty[] = [{
          ColumnName: 'OpsTagSpecDefinitionId|OpsMultiTags.TagSpecDefinitionId',
          Value: foundDef.Id,
          Operand: 'IN',
        }];
        fetchPage(filters, false, 0, undefined, defIdFilter);

        // Background: fetch count by tag name + transaction type to detect other rules producing this tag
        const tagNameFilter: FilterProperty[] = [
          { ColumnName: 'OpsTag|OpsMultiTags.Tag', Value: tagName, Operand: 'IN' },
          { ColumnName: 'TransactionTypeCode', Value: formState.transactionTypeCode, Operand: 'EQ' },
        ];
        fetchCount(filters, tagNameFilter).then((count) => {
          setTagClickState((prev) => prev ? { ...prev, tagNameCount: count } : prev);
        });
      }
    }
  }, [libraries, builder, isLiveMode, filterDefinitions, filters, fetchPage, fetchCount]);

  // Auto-open a definition's rule builder when navigating from the Backlog with a pendingDefinitionId
  useEffect(() => {
    if (!pendingDefIdRef.current || libraries.length === 0) return;
    const defId = pendingDefIdRef.current;
    pendingDefIdRef.current = null;
    onClearPendingDefinition?.();

    let tagName: string | undefined;
    for (const lib of libraries) {
      const def = lib.TagSpecDefinitions.find(d => d.Id === defId);
      if (def) { tagName = def.Tag; break; }
    }
    if (tagName) {
      setTimeout(() => handleTagClick(tagName!, defId), 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraries]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed?.Transactions && Array.isArray(parsed.Transactions)) {
          loadTransactions(parsed.Transactions);
          setToast({ message: `Loaded ${parsed.Transactions.length} transactions`, type: 'success' });
        } else {
          setToast({ message: 'Invalid format: expected { "Transactions": [...] }', type: 'error' });
        }
      } catch {
        setToast({ message: 'Failed to parse JSON file', type: 'error' });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [loadTransactions]);

  return (
    <div>
      {activeCheckout && isReadOnly && ownerName && (
        <div className="flex items-center px-4 py-2 mb-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700">
          <svg className="w-4 h-4 text-amber-500 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          <span className="text-sm text-amber-800 dark:text-amber-300">
            Checked out by <span className="font-semibold">{ownerName}</span> — read-only
          </span>
        </div>
      )}
      <div data-tour="transactions-header" className="flex items-center justify-between mb-1 min-h-10">
        <div className='flex flex-col md:flex-row items-start justify-end md:items-center gap-2'>
          <h2 className="text-base font-semibold text-heading">Transactions</h2>
          <span className='text-sm mr-5 min-w-10 text-primary-dark'>({builderOpen && builderHasContent ? filteredData.length.toLocaleString() : isLiveMode && totalTransactionsCount != null ? totalTransactionsCount.toLocaleString() : filteredData.length})</span>
          <div className="flex items-center gap-4">
            <Toggle label="Compact mode" checked={relaxedMode} onChange={setRelaxedMode} />
            <Toggle label="Incremental pagination" checked={incrementalPagination} onChange={(v) => {
              setIncrementalPagination(v);
              setCurrentPage(0);
              setPageInputValue('1');
              setVisibleCount(BATCH_SIZE);
              if (!v && isLiveMode) fetchPage(filters, false, 0, undefined, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
            }} />
            <span data-tour="show-attributes-toggle"><Toggle label="Show attributes" checked={showAttributes} onChange={setShowAttributes} /></span>
          </div>

          <div className="hidden md:flex items-center gap-5 ml-4 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-border-strong text-[8px] font-semibold text-faint">i</span>
              Data as provided by the bank(s)
            </span>
            <span className="flex items-center gap-1 text-primary">
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-primary text-[8px] font-semibold text-primary">i</span>
              Enhanced data based on existing tag definitions
            </span>
            <span className="flex items-center gap-1 text-orange-500">
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-orange-400 text-[8px] font-semibold text-orange-500">i</span>
              Data as customized by the user
            </span>
          </div>

        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileUpload}
          />
          {!builderOpen && !isLiveMode && <Button variant="primary" size="xs" onClick={() => {
            fileInputRef.current?.click()
          }}>
            Upload Data
          </Button>}
          {isCustomData && !isLiveMode && (
            <Button variant="danger" size="xs" onClick={resetToSample}>
              Reset to Sample
            </Button>
          )}
          {!builderOpen && (
            activeCheckout ? (
              <Button
                data-tour="open-rule-builder"
                variant="secondary"
                size="xs"
                onClick={() => {
                  setShowOnlyUntagged(false)
                  setShowOnlyMultiTagged(false)
                  setBuilderOpen(true)
                }}
              >
                Create a Rule
              </Button>
            ) : (
              <Tooltip content="You need to check out a bank/side combination from the Stats page first" placement="bottom">
                <span>
                  <Button
                    data-tour="open-rule-builder"
                    variant="secondary"
                    size="xs"
                    disabled
                  >
                    Create a Rule
                  </Button>
                </span>
              </Tooltip>
            )
          )}
        </div>
      </div>

      {/* {!builderOpen && ( */}
      <DynamicFilters
        data={analyzedData}
        fieldMeta={fieldMeta}
        tagDefinitions={tagDefinitions}
        filters={filters}
        onFiltersChange={setFilters}
        showOnlyUntagged={showOnlyUntagged}
        onShowOnlyUntaggedChange={setShowOnlyUntagged}
        showOnlyMultiTagged={showOnlyMultiTagged}
        onShowOnlyMultiTaggedChange={setShowOnlyMultiTagged}
        showOnlyDeadEnd={showOnlyDeadEnd}
        onShowOnlyDeadEndChange={setShowOnlyDeadEnd}
        baseFilters={baseFilters}
        isLiveMode={isLiveMode}
        filterDefinitions={filterDefinitions}
        filterDefinitionsLoading={filterDefinitionsLoading}
        decimalMaxValues={decimalMaxValues}
        disabledFilterTags={tagClickState?.showingAll && tagClickState.tagFilterKey ? new Set([tagClickState.tagFilterKey]) : undefined}
        endSlot={tableColumns.length > 0 ? (
          <ColumnPicker columns={tableColumns} hiddenColumns={effectiveHiddenColumns} onChange={setHiddenColumns} columnOrder={columnOrder} onColumnOrderChange={setColumnOrder} defaultHiddenColumns={defaultHiddenColumns} onReset={handleColumnReset} />
        ) : undefined}
      />
      {/* )} */}

      {/* Rule builder panel */}
      {builderOpen && (
        <div data-tour="rule-builder-panel" ref={builderRef} className="flex flex-col mb-6 border border-primary/20 rounded-xl bg-primary/5 overflow-hidden">
          <div className="px-5 py-3 bg-primary/15 border-b border-primary/20 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-primary-dark">Rule Builder</h3>
              <p className="text-xs text-primary-dark">
                Build rules and see their effect on the table in real time.
              </p>
            </div>
            <div data-tour="builder-transaction-type" className="flex items-center gap-2">
              <label className="text-xs font-medium text-primary-dark whitespace-nowrap">Transaction Type</label>
              <TransactionTypePicker
                value={builder.formState.transactionTypeCode}
                onChange={(val) => builder.updateBasicInfo({ transactionTypeCode: val })}
                filterDefinitions={filterDefinitions}
              />
            </div>
            <div className="flex flex-col md:flex-row items-center gap-2">
              <Button variant="ghost" size="xs" onClick={handleDiscard}>
                Discard
              </Button>
              {tagClickState && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => handleApplyRules()}
                  disabled={!builderHasContent}
                >
                  Apply Rules
                </Button>
              )}
              <Button
                data-tour="create-tag-button"
                variant="primary"
                size="xs"
                onClick={handleCreateFromBuilder}
                disabled={!builderHasContent || isReadOnly}
              >
                {editingDef ? `Save changes for "${editingDef.Tag}"` : 'Create Rule with current settings'}
              </Button>
            </div>
          </div>


          <div className="p-5 flex flex-col md:flex-row  flex-1 gap-5">
            {/* Matching rules section */}
            <div className='w-full md:w-1/2'>
              <h4 className="text-xs font-semibold text-body-secondary uppercase tracking-wide mb-1">
                Matching Rules
              </h4>
              <StepRuleExpressions
                ruleGroups={builder.formState.ruleGroups}
                onAddGroup={tagClickState
                  ? () => {
                      builder.addRuleGroup();
                      handleApplyRules();
                    }
                  : builder.addRuleGroup}
                onRemoveGroup={tagClickState
                  ? (groupId) => {
                      builder.removeRuleGroup(groupId);
                      const newFormState = {
                        ...builder.formState,
                        ruleGroups: builder.formState.ruleGroups.filter((g) => g.id !== groupId),
                      };
                      handleApplyRules(newFormState);
                    }
                  : builder.removeRuleGroup}
                onAddCondition={builder.addCondition}
                onRemoveCondition={tagClickState
                  ? (groupId, condId) => {
                      builder.removeCondition(groupId, condId);
                      const newFormState = {
                        ...builder.formState,
                        ruleGroups: builder.formState.ruleGroups.map((g) =>
                          g.id === groupId
                            ? { ...g, conditions: g.conditions.filter((c) => c.id !== condId) }
                            : g
                        ),
                      };
                      handleApplyRules(newFormState);
                    }
                  : builder.removeCondition}
                onUpdateCondition={builder.updateCondition}
                onConditionSave={tagClickState ? () => handleApplyRules() : undefined}
                startCollapsed={!!editingDef}
              />
            </div>

            {/* Attributes section */}
            <div className='w-full md:w-1/2 relative'>
              {/* <div className='absolute flex bg-blue-50/50 w-full h-full opacity-100 rounded-sm'></div> */}
              <h4 className="text-xs font-semibold text-body-secondary uppercase tracking-wide mb-1">
                Attributes
              </h4>
              <StepAttributes
                attributes={builder.formState.attributes}
                onAdd={builder.addAttribute}
                onRemove={builder.removeAttribute}
                onUpdate={builder.updateAttribute}
                transactions={filteredData.map((d) => d.row)}
                startCollapsed={!!editingDef}
              />
            </div>
          </div>

          <span className='flex flex-col items-center w-full text-slate-500 text-xs pb-2 gap-1'>
            {/* Records count — always shown */}
            <span className='flex items-baseline'>
              Records: <span className='text-primary pl-1 text-base'>{filteredData.length}</span>
            </span>
            {/* Ruleset match count — only shown after API confirms AND counts differ */}
            {tagClickState?.rulesetApplied &&
              tagClickState.rulesetMatchCount != null &&
              tagClickState.rulesetMatchCount !== filteredData.length && (
              <span className='text-[11px] text-emerald-600 dark:text-emerald-400'>
                {tagClickState.rulesetMatchCount.toLocaleString()} transaction{tagClickState.rulesetMatchCount !== 1 ? 's' : ''} match this ruleset
              </span>
            )}

            {/* After Apply Rules: discard changes + show all */}
            {tagClickState?.rulesetApplied && !tagClickState.showingAll && (
              <button
                className='text-[11px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer'
                onClick={() => {
                  if (!tagClickState) return;
                  builder.setFormState(tagClickState.originalFormState);
                  const tagNameFilter = new Set([tagClickState.tagName]);
                  setFilters({ ...tagClickState.preFilters, [tagClickState.tagFilterKey]: tagNameFilter });
                  setTagClickState((prev) => prev ? { ...prev, rulesetApplied: false, rulesetFilters: [], showingAll: true } : prev);
                }}
              >
                Discard your unsaved changes and show all
              </button>
            )}

            {/* Before Apply Rules: show "other transactions" link */}
            {tagClickState && !tagClickState.showingAll && !tagClickState.rulesetApplied &&
              tagClickState.tagNameCount !== null && (
              <button
                className='text-[11px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer'
                onClick={() => {
                  if (!tagClickState) return;
                  const tagNameFilter = new Set([tagClickState.tagName]);
                  setFilters({ ...tagClickState.preFilters, [tagClickState.tagFilterKey]: tagNameFilter });
                  setTagClickState((prev) => prev ? { ...prev, showingAll: true } : prev);
                }}
              >
                {tagClickState.tagNameCount.toLocaleString()} transaction{tagClickState.tagNameCount !== 1 ? 's' : ''} have this tag — click to show all
              </button>
            )}
          </span>

        </div>
      )}

      {!loading && visibleData.length === 0 ? (
        <EmptyState
          title="No transactions found"
          description="No transactions match the current filters. Try adjusting your filter criteria or clearing some filters."
          icon={
            <svg className="w-7 h-7 text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          }
        />
      ) : (
      <TransactionTable
        data={visibleData}
        tagDefinitions={allDefinitions}
        originalDefinitionIds={originalDefinitionIds}
        definitionSourceMap={definitionSourceMap}
        highlightExpressions={highlightExpressions}
        searchHighlights={searchHighlights}
        onTagClick={handleTagClick}
        onFlagDeadEnd={!isReadOnly && !tagClickState?.showingAll && !tagClickState?.rulesetApplied ? flagDeadEnd : undefined}
        showAttributes={showAttributes}
        relaxedMode={relaxedMode}
        hiddenColumns={effectiveHiddenColumns}
        columnOrder={columnOrder}
        onColumnsReady={setTableColumns}
        builderHeight={builderHeight}
        loading={loading}
        accentHue={190}
//   190 — cyan (default)
// 220 — blue
// 260 — purple
// 340 — pink
// 30 — orange
// 140 — green
      />
      )}

      {(hasMore || loading || (!incrementalPagination && (isLiveMode ? (totalTransactionsCount ?? 0) > BATCH_SIZE : filteredLen > BATCH_SIZE))) && (
        <div className="flex items-center justify-center gap-3 py-2 mt-1 border border-border bg-surface-secondary rounded-lg">
          {loading ? (
            <div className="flex items-center gap-3 animate-pulse">
              <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="h-5 w-10 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-5 w-10 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-5 w-10 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-5 w-10 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ) : incrementalPagination ? (
            <>
              <span className="text-xs text-muted">
                <span className="font-medium text-heading">{(isLiveMode ? transactions.length : visibleCount).toLocaleString()}</span>
                {' loaded · '}
                <span className="font-medium text-heading">{(isLiveMode ? (totalTransactionsCount ?? transactions.length) : filteredLen).toLocaleString()}</span>
                {' total'}
              </span>
              {hasMore && (() => {
                const loaded = isLiveMode ? transactions.length : visibleCount;
                const total = isLiveMode ? (totalTransactionsCount ?? transactions.length) : filteredLen;
                const remaining = Math.max(0, total - loaded);
                const batches = [25, 50, 200, 500].filter((b) => b <= remaining);
                if (batches.length === 0 && remaining > 0) batches.push(remaining);
                if (batches.length === 0) return null;
                return (
                  <>
                    <span className="text-border">|</span>
                    {batches.map((size) => (
                      <Button key={size} variant="outline" size="xs" onClick={() => {
                        if (isLiveMode) {
                          fetchPage(filters, true, undefined, size, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
                        } else {
                          setVisibleCount((c) => c + size);
                        }
                      }}>
                        +{size.toLocaleString()}
                      </Button>
                    ))}
                  </>
                );
              })()}
            </>
          ) : (
            <>
              <Button variant="ghost" size="xs" disabled={currentPage === 0} onClick={() => {
                const newPage = currentPage - 1;
                setCurrentPage(newPage);
                setPageInputValue(String(newPage + 1));
                if (isLiveMode) fetchPage(filters, false, newPage, undefined, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
              }}>
                &larr; Previous
              </Button>
              <span className="text-xs text-muted flex items-center gap-1">
                Page
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-10 text-center text-xs border border-border rounded px-1 py-0.5 bg-surface text-heading focus:outline-none focus:border-primary"
                  value={pageInputValue}
                  onChange={(e) => setPageInputValue(e.target.value)}
                  onBlur={() => {
                    const num = parseInt(pageInputValue, 10);
                    if (!isNaN(num) && num >= 1 && num <= classicTotalPages) {
                      setCurrentPage(num - 1);
                      if (isLiveMode) fetchPage(filters, false, num - 1, undefined, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
                    }
                    setPageInputValue(String(currentPage + 1));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const num = parseInt(pageInputValue, 10);
                      if (!isNaN(num) && num >= 1 && num <= classicTotalPages) {
                        setCurrentPage(num - 1);
                        setPageInputValue(String(num));
                        if (isLiveMode) fetchPage(filters, false, num - 1, undefined, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
                      } else {
                        setPageInputValue(String(currentPage + 1));
                      }
                    }
                  }}
                />
                of {classicTotalPages.toLocaleString()}
              </span>
              <Button variant="ghost" size="xs" disabled={currentPage >= classicTotalPages - 1} onClick={() => {
                const newPage = currentPage + 1;
                setCurrentPage(newPage);
                setPageInputValue(String(newPage + 1));
                if (isLiveMode) fetchPage(filters, false, newPage, undefined, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
              }}>
                Next &rarr;
              </Button>
              {/* <span className="text-xs text-muted ml-2">
                ({(isLiveMode ? totalTransactionsCount ?? 0 : filteredLen).toLocaleString()} total)
              </span> */}
            </>
          )}
        </div>
      )}

      {wizardOpen && (
        <TagWizardModal
          existingDef={editingDef}
          parentLib={editingParentLib}
          initialFormState={wizardInitialState}
          initialStep={wizardInitialStep}
          fromCheckoutContext={wizardFromCheckout}
          onSave={handleWizardSave}
          onClose={handleWizardClose}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
