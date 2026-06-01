import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useAuth } from '../../context/AuthContext';
import { useTransactionData } from '../../hooks/useTransactionData';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useMatchingTagIds } from '../../hooks/useMatchingTagIds';
import { buildRulesetFilters } from '../../utils/buildRulesetFilters';
import {
  hasDuplicateGroups,
  hasEmptyRuleGroup,
  hasIncompleteCondition,
  hasWithinGroupConditionDuplicates,
} from '../../utils/ruleFingerprint';
import {
  hasDuplicateAttributeNames,
  hasIncompleteAttribute,
} from '../../utils/attributeFingerprint';
import type { FilterProperty } from '../../api/transactions';
import { getAllTransactionTags, DEFAULT_SORTING } from '../../api/transactions';
import { translateFilters } from '../../utils/translateFilters';
import { useOptionalDownloadCenter } from '../../context/DownloadCenterContext';
import { useWizardForm, fromExistingDefinition } from '../../hooks/useWizardForm';
import type { TagSpecDefinition, TagSpecLibrary, AnalyzedTransaction, WizardFormState, RuleExpression, CheckoutState, TransactionRow } from '../../types';
import type { WizardFormResult } from '../../hooks/useWizardForm';
import { analyzeRow } from '../../utils/analyzeRow';
import { computeDefinitionVersions } from '../../utils/definitionVersions';
import { getAllTagNameOptions, getAttributeSuggestionsForTag } from '../../utils/tagNameLookup';
import { SearchableSelect } from '../shared/SearchableSelect';
import { regexify, regexifyExtraction, generateExpressionPrompt, generateExtractionPrompt } from '../../utils/regexify';
import { generateExpressionId } from '../../utils/uuid';
import { getContextValue } from '../../types/tagSpec';
import { TransactionTable, ColumnPicker, ALLOWED_COLUMN_KEYS, DEFAULT_VISIBLE_COLUMN_KEYS, PREVIEW_TEMP_DEF_ID, renderTagTooltip, type ColumnDef } from './TransactionTable';
import { TagBadge } from './TagBadge';
import { StepRuleExpressions } from '../wizard/StepRuleExpressions';
import { StepAttributes } from '../wizard/StepAttributes';
import { TagWizardModal } from '../wizard/TagWizardModal';
import { DuplicateRulesButton } from '../wizard/DuplicateRulesButton';
import { LovBrowserDrawer } from '../lovs/LovBrowserDrawer';
import { Button } from '../shared/Button';
import { CopyableId } from '../shared/CopyableId';
import { Toast } from '../shared/Toast';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Tooltip } from '../shared/Tooltip';
import { DynamicFilters } from './DynamicFilters';
import { Toggle } from '../shared/Toggle';
import { useLocalChanges } from '../../hooks/useLocalChanges';
import { EmptyState } from '../shared/EmptyState';
import { TransactionTypePicker } from '../shared/TransactionTypePicker';
import { tagSpecLibrarySave } from '../../api/tagSpecSave';
import { ShareLinkDialog } from '../shared/ShareLinkDialog';
import { RowContextMenu } from './RowContextMenu';
import { CommentDialog, type CommentDialogResult } from './CommentDialog';
import { ViewContextModal } from './ViewContextModal';
import { OtherDefinitionsTransactionsModal } from './OtherDefinitionsTransactionsModal';
import { CurrentTagsDropdown } from './CurrentTagsDropdown';
import { TagDetailPanel } from './TagDetailPanel';
import { HiddenTagsPanel } from './HiddenTagsPanel';
import { useTepConfig } from '../../context/TepConfigContext';
import type { TepHeaders } from '../../api/transactions';
import { CommentsProvider } from '../../context/CommentsContext';
import {
  useWizardCommentDraftsState,
  WizardCommentDraftsProvider,
  WIZARD_DEFINITION_FORM_KEY,
} from '../../context/WizardCommentDraftsContext';
import { setTagSpecComment } from '../../api/comments';
import { WizardCommentIconButton } from '../wizard/WizardCommentIconButton';
import { CommentSearchTrigger } from '../comments/CommentSearchTrigger';
import { CommentSearchPanel } from '../comments/CommentSearchPanel';
import type { TagSpecCommentTarget } from '../../types/comments';

interface ShareTogglesInput {
  compactMode: boolean;
  incrementalPagination: boolean;
  showAttributes: boolean;
}

interface TransactionsTabProps {
  activeCheckout?: CheckoutState | null;
  onClearPendingDefinition?: () => void;
  onCheckin?: (bank: string, side: string) => void;
  onRelease?: (bank: string, side: string) => void;
  onRequestUndo?: (bank: string, side: string) => void;
  /** Filters injected from a share link — applied once after mount. */
  initialShareFilters?: Record<string, Set<string>>;
  /** Toggles injected from a share link — applied once after mount. */
  initialShareToggles?: ShareTogglesInput;
  /** Current operator display name (for share link authorship). */
  operatorName?: string;
  /** Controlled open state for the share dialog (triggered from header). */
  shareDialogOpen?: boolean;
  /** Callback to close the share dialog. */
  onShareDialogClose?: () => void;
  /** FilteringProperties forwarded from a Backlog pill click (Clean, Untagged,
   *  etc). Consumed once on mount/change and merged into the live-mode
   *  outgoing fetch via `activeExtraFilters` — they outlive a single fetch so
   *  the operator can still paginate within the scoped view. */
  pendingPillFilters?: FilterProperty[] | null;
  /** Called after `pendingPillFilters` has been picked up so the parent can
   *  null it out — prevents the same scope being reapplied if the user
   *  navigates back to the tab. */
  onPendingPillFiltersConsumed?: () => void;
}

function formStateToTempDefinition(formState: WizardFormState): TagSpecDefinition | null {
  const hasCondition = formState.ruleGroups.some((g) =>
    g.conditions.some((c) => c.value.trim().length > 0)
  );
  const hasAttribute = formState.attributes.some((a) => a.attributeTag.trim().length > 0);
  // A transaction type alone is a valid rule: the resulting tag matches every
  // row of that type, no further rule expressions or attributes required.
  const hasTransactionType = formState.transactionTypeCode.trim().length > 0;
  if (!hasCondition && !hasAttribute && !hasTransactionType) return null;

  const id = PREVIEW_TEMP_DEF_ID;
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
        // Constant-mode attribute: same wire shape as the save path —
        // `Constant` filled, no AttributeRuleExpression, no Transformations.
        // The runtime extractor short-circuits on `Constant != null`, so the
        // value lights up across every matching row in the live preview.
        if (attr.isConstant) {
          return {
            AttributeTag: attr.attributeTag,
            IsMandatory: attr.isMandatory,
            LOVTag: null,
            ValidationRuleTag: '',
            Constant: attr.constantValue ?? '',
            AttributeRuleExpression: null,
            Transformations: null,
          };
        }
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
          suffixOrEndOfInput: attr.suffixOrEndOfInput,
          tillEndOfInput: attr.tillEndOfInput,
        };
        const prompt = generateExtractionPrompt(attr.extractionOperation, params);
        // Prefer the backend's original regex when the user hasn't edited
        // extraction. Round-tripping form params through regexifyExtraction is
        // lossy for some ops (e.g. extract_after with prefix '^'), and the
        // resulting rebuilt regex would silently fail to match — making the
        // table fall back to server values without the draft's transformations.
        // updateAttribute clears _originalRegex when extraction fields change,
        // so this fallback only kicks in when the user is editing, say, a
        // transformation or validation rule.
        const regex = attr._originalRegex ?? regexifyExtraction(attr.extractionOperation, params);
        return {
          AttributeTag: attr.attributeTag,
          IsMandatory: attr.isMandatory,
          LOVTag: attr.isLovBased ? (attr.lovTag ?? null) : null,
          ValidationRuleTag: attr.validationRuleTag,
          AttributeRuleExpression: {
            SourceField: attr.sourceField,
            ExpressionPrompt: null,
            ExpressionId: generateExpressionId(id, 'attr', index),
            Regex: regex,
            RegexDetails: [{ LanguageCode: 'en', Description: prompt }],
          },
          ...((attr.transformations && attr.transformations.length > 0)
            ? {
                Transformations: attr.transformations.map((t) => ({
                  Method: t.method,
                  Args: Object.entries(t.args).map(([k, v]) => ({ Key: k, Value: v })),
                })),
              }
            : {}),
        };
      }),
  };
}

const BATCH_SIZE = 50;
// Stable set identity for the Rule Builder's double-click affordance —
// re-creating the Set on every render would re-trigger memoization
// downstream. Frozen so accidental mutation doesn't bypass the singleton.
const TRANSACTION_TYPE_INTERACTIVE_FIELDS: ReadonlySet<string> = new Set(['TransactionTypeCode']);
// A row is hidden when any of its analyzeRow-resolved matched definitions
// is in the hidden set. Hide is per-def-Id (CLAUDE.md gotcha #3), so a row
// that re-evaluates to a non-hidden def via local rules stays visible even
// when its persisted backend tag references a hidden def.
function isRowHidden(
  matchedDefinitions: ReadonlyArray<{ Id: string } | undefined | null>,
  hiddenDefIds: ReadonlySet<string>,
): boolean {
  for (const d of matchedDefinitions) {
    if (d && hiddenDefIds.has(d.Id)) return true;
  }
  return false;
}


export function TransactionsTab({ activeCheckout, onClearPendingDefinition, initialShareFilters, initialShareToggles, operatorName, shareDialogOpen: shareDialogOpenProp, onShareDialogClose, pendingPillFilters, onPendingPillFiltersConsumed }: TransactionsTabProps) {
  const { libraries, tagDefinitions, originalDefinitionIds, dispatch, isPairBeingTagged, rawHierarchyNodes } = useTagSpecs();
  const { userId, usersMap, getAuthHeaders, refreshIfNeeded, isAudit } = useAuth();
  const { extractionMethods } = useLovAttributes();
  const tepConfig = useTepConfig();
  const { saveBaseline, updateCurrent } = useLocalChanges(activeCheckout?.bank, activeCheckout?.side);

  // Determine if the current user is NOT the checkout owner (read-only mode)
  const { isReadOnly, ownerName } = useMemo(() => {
    if (isAudit) return { isReadOnly: true, ownerName: null };
    if (!activeCheckout) return { isReadOnly: true, ownerName: null };
    const inProgressLib = libraries.find(
      (l) =>
        l.StatusTag === 'INPROGRESS' &&
        getContextValue(l.Context, 'BankSwiftCode') === activeCheckout.bank &&
        getContextValue(l.Context, 'Side') === activeCheckout.side
    );
    if (!inProgressLib || !inProgressLib.OperatorId) return { isReadOnly: true, ownerName: null };
    // A background tagging job locks the whole pair regardless of ownership.
    if (isPairBeingTagged(inProgressLib)) {
      const owned = inProgressLib.OperatorId === userId;
      const name = !owned ? (usersMap.get(inProgressLib.OperatorId) ?? inProgressLib.OperatorId) : null;
      return { isReadOnly: true, ownerName: name };
    }
    const owned = inProgressLib.OperatorId === userId;
    const name = !owned ? (usersMap.get(inProgressLib.OperatorId) ?? inProgressLib.OperatorId) : null;
    return { isReadOnly: !owned, ownerName: name };
  }, [activeCheckout, libraries, userId, usersMap, isPairBeingTagged, isAudit]);

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

  const definitionVersions = useMemo(
    () => computeDefinitionVersions(inProgressLib),
    [inProgressLib],
  );

  const tagNameOptions = useMemo(
    () => getAllTagNameOptions(libraries, rawHierarchyNodes),
    [libraries, rawHierarchyNodes],
  );

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
    setComments, flagDeadEndWithComment,
    isLiveMode, loading, hasMore: liveHasMore, totalTransactionsCount, fetchPage, fetchCount,
    trimLoadedTransactions,
    filterDefinitions, filterDefinitionsLoading, fetchFilterDefinitions,
    decimalMaxValues,
  } = useTransactionData();
  // Fetch filter definitions when the Transactions tab mounts
  useEffect(() => {
    if (isLiveMode && filterDefinitions.length === 0) {
      fetchFilterDefinitions();
    }
  }, [isLiveMode, fetchFilterDefinitions, filterDefinitions.length]);
  // DECIMAL filter sliders use a static 200M default ceiling instead of a
  // probe-API call (see DEFAULT_DECIMAL_MAX in DynamicFilters). Edit mode lets
  // the user type a higher value if their workload needs it, so we don't pay
  // the cost of an unscoped probe round-trip on every navigation here.

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rule builder state (reuses the wizard form hook)
  const builder = useWizardForm(undefined, undefined, fieldMeta.sourceFields[0]);
  const builderAttributeNamesKey = builder.formState.attributes.map((a) => a.attributeTag).join('|');
  const suggestedAttributeNames = useMemo(
    () => getAttributeSuggestionsForTag(
      libraries,
      builder.formState.tag,
      builder.formState.attributes.map((a) => a.attributeTag),
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [libraries, builder.formState.tag, builderAttributeNamesKey],
  );
  const [builderOpen, setBuilderOpen] = useState(false);
  // When collapsed the builder shows only its header bar (title, type/tag
  // picker, action buttons) so the operator can hand the rest of the screen
  // over to the transactions table without closing the builder entirely.
  const [builderCollapsed, setBuilderCollapsed] = useState(false);
  const [lovBrowserOpen, setLovBrowserOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
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
      if (!stored) return [];
      const parsed = JSON.parse(stored) as string[];
      // Migrate legacy '__dates' grouped-column key → three separate date columns.
      if (parsed.includes('__dates')) {
        return parsed.flatMap((k) =>
          k === '__dates' ? ['data:StatementDate', 'data:EntryDate', 'data:ValueDate'] : [k]
        );
      }
      return parsed;
    } catch { return []; }
  });
  const [tableColumns, setTableColumns] = useState<ColumnDef[]>([]);
  const [visibleTableColumns, setVisibleTableColumns] = useState<ColumnDef[]>([]);
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  // Hidden tag spec state — a set of OpsTagSpecDefinitionIds. Hiding a tag
  // spec removes every row matched by that definition from the current view;
  // unhiding restores all rows in one shot. The panel groups by tag spec so
  // the operator sees one chip per hidden definition, not one per row.
  // Persisted to sessionStorage alongside the checkout's bank/side so:
  //  - Navigating between tabs (which unmounts TransactionsTab — TabContainer
  //    only renders the active tab) doesn't lose the set.
  //  - A page refresh during the same browser-tab session is also preserved.
  //  - Releasing / checking-in / switching to a different bank or side
  //    discards the set (handled by the bank/side-change effect below).
  // The state is initialised synchronously from storage in the useState lazy
  // initializer so the very first render already has the restored ids —
  // critical, because a separate restore-via-useEffect would race with the
  // persistence effect on mount and wipe the storage.
  const HIDDEN_DEF_IDS_STORAGE_KEY = 'tep:hiddenDefIds';
  const [hiddenDefIds, setHiddenDefIds] = useState<Set<string>>(() => {
    const currBank = activeCheckout?.bank ?? null;
    const currSide = activeCheckout?.side ?? null;
    if (!currBank) return new Set();
    try {
      const raw = sessionStorage.getItem(HIDDEN_DEF_IDS_STORAGE_KEY);
      if (!raw) return new Set();
      const stored = JSON.parse(raw) as { bank?: string; side?: string; ids?: string[] } | null;
      if (
        stored &&
        stored.bank === currBank &&
        stored.side === currSide &&
        Array.isArray(stored.ids)
      ) {
        return new Set(stored.ids);
      }
    } catch { /* fall through to empty */ }
    return new Set();
  });
  const [hiddenTagsPanelOpen, setHiddenTagsPanelOpen] = useState(false);
  const [hideBusy, setHideBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ row: TransactionRow; x: number; y: number } | null>(null);
  const [contextModalRow, setContextModalRow] = useState<TransactionRow | null>(null);
  const [otherDefsModalOpen, setOtherDefsModalOpen] = useState(false);
  const [singleRowCommentRow, setSingleRowCommentRow] = useState<TransactionRow | null>(null);
  const shareFiltersConsumed = useRef(false);
  const shareFiltersRef = useRef(initialShareFilters);
  const shareTogglesRef = useRef(initialShareToggles);
  // Keep refs in sync (only updates on first non-null value)
  if (initialShareFilters && !shareFiltersRef.current) shareFiltersRef.current = initialShareFilters;
  if (initialShareToggles && !shareTogglesRef.current) shareTogglesRef.current = initialShareToggles;
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

  // IDs picked from the Current Tags dropdown. Multi-select; joined by '|'
  // into an OpsTagSpecDefinitionId IN filter when non-empty (see
  // activeExtraFilters below). The Rule Builder uses this state too —
  // see the lock-sync effect colocated with `editingDef` below.
  const [currentTagFilterIds, setCurrentTagFilterIds] = useState<Set<string>>(new Set());

  // Pill-scope filters: consumed once from the parent on mount/change and
  // held locally so they survive subsequent renders and outgoing-filter
  // recomputes. Cleared by the user via the standard Clear Filters control
  // (wired below) or replaced by clicking another Backlog pill.
  //
  // The actual Show Only checkbox sync happens in a second effect placed
  // after the baseFilters-reset effect — see "pill -> Show Only sync"
  // below. We can't sync here because the [baseFilters] effect runs after
  // this one (source order), and its `setFilters({ ...baseFilters })`
  // would overwrite anything we wrote here.
  const [activePillFilters, setActivePillFilters] = useState<FilterProperty[]>([]);
  useEffect(() => {
    if (!pendingPillFilters || pendingPillFilters.length === 0) return;
    setActivePillFilters(pendingPillFilters);
    onPendingPillFiltersConsumed?.();
  }, [pendingPillFilters, onPendingPillFiltersConsumed]);

  // Extra filters injected into API calls (definition-ID scoping, REGEX ruleset, or transaction type from builder).
  // Narrow the deps to the exact fields of tagClickState we read, so downstream
  // updates (e.g. tagNameCount from the background count fetch) don't churn the
  // memo identity and trigger a duplicate page fetch.
  const tagClickDefinitionId = tagClickState?.definitionId;
  const tagClickRulesetApplied = tagClickState?.rulesetApplied ?? false;
  const tagClickShowingAll = tagClickState?.showingAll ?? false;
  const tagClickRulesetFilters = tagClickState?.rulesetFilters;
  const activeExtraFilters: FilterProperty[] = useMemo(() => {
    if (tagClickDefinitionId != null) {
      // After "Apply Rules": use REGEX-based filters (Call 3)
      if (tagClickRulesetApplied) {
        return [...(tagClickRulesetFilters ?? []), ...activePillFilters];
      }
      // Default tag-click mode: scope by definition ID (Call 2)
      if (!tagClickShowingAll) {
        return [
          {
            ColumnName: 'OpsTagSpecDefinitionId|OpsMultiTags.TagSpecDefinitionId',
            Value: tagClickDefinitionId,
            Operand: 'IN',
          },
          ...activePillFilters,
        ];
      }
      // "Show all" mode: don't scope by TransactionTypeCode — the tag name filter
      // (applied via `filters`) is what the user wants to broaden to.
      return [...activePillFilters];
    }
    const extra: FilterProperty[] = [];
    // Current Tags multi-select scope. Multi-value IN goes as a pipe-joined
    // Value (CLAUDE.md gotcha #15) — same shape used by the SHOW ONLY filter
    // and the hidden-tag-count call. Applied whether or not the rule builder
    // is open: this filter lives on OpsTagSpecDefinitionId, the builder's
    // preview lives on data columns / REGEX — different surfaces, so they
    // AND together cleanly. Earlier code skipped this while the builder was
    // open on the assumption they shared a column; that wasn't true.
    if (currentTagFilterIds.size > 0) {
      extra.push({
        ColumnName: 'OpsTagSpecDefinitionId|OpsMultiTags.TagSpecDefinitionId',
        Value: [...currentTagFilterIds].join('|'),
        Operand: 'IN',
      });
    }
    if (builderOpen && builder.formState.transactionTypeCode) {
      extra.push({ ColumnName: 'TransactionTypeCode', Value: builder.formState.transactionTypeCode, Operand: 'EQ' });
    }
    // While authoring a rule, also scope the live transactions fetch by the
    // ruleset being composed so the table reflects what the rule will catch.
    // Bank/side/TransactionTypeCode are already wired up above, so we only
    // forward the REGEX entry from buildRulesetFilters.
    if (builderOpen) {
      const ruleset = buildRulesetFilters(builder.formState);
      const regex = ruleset.find((f) => 'Operand' in f && f.Operand === 'REGEX');
      if (regex) extra.push(regex);
    }
    // Pill-scope filters AND with everything else — they're plain server
    // flag filters (OpsIsUntagged, OpsIsDeadEnd, OpsContainsInvalidAttributes,
    // etc.) that compose cleanly with the operator's other filters.
    extra.push(...activePillFilters);
    return extra;
  }, [tagClickDefinitionId, tagClickRulesetApplied, tagClickShowingAll, tagClickRulesetFilters, builderOpen, builder.formState, currentTagFilterIds, activePillFilters]);

  // Forward the UI filter state as-is. Earlier this hook stripped bank/side
  // when a TagSpecDefinitionId scope was active, on the theory that the
  // definition's parent library already implies them — but it actually
  // stripped the WHOLE filter set, which silently dropped the operator's
  // Bank Reference, IBAN, Search, etc. Detected Tag Specs are computed
  // against the active checkout's bank/side anyway, so the redundancy is
  // harmless; the simpler "send everything the user set" path is correct.
  const outgoingFilters = filters;

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

  // Reset the collapse toggle whenever the builder closes so the next open
  // starts expanded — operators rarely want a freshly-opened builder hidden.
  useEffect(() => {
    if (!builderOpen) setBuilderCollapsed(false);
  }, [builderOpen]);


  const defaultHiddenColumns = useMemo(() => {
    // Show the debit column only when the checked-out side produces debit rows,
    // and the credit column only when it produces credit rows. When no checkout
    // is active, keep both visible as a safe fallback.
    const side = activeCheckout?.side;
    const debitSide = side === 'DR' || side === 'RC';
    const creditSide = side === 'CR' || side === 'RD';
    const showDebit = !side || debitSide;
    const showCredit = !side || creditSide;

    const s = new Set<string>();
    for (const col of tableColumns) {
      if (col.type === 'tags') continue;
      if (col.type === 'attribute') continue;
      if (col.key === '__debit') {
        if (!showDebit) s.add(col.key);
        continue;
      }
      if (col.key === '__credit') {
        if (!showCredit) s.add(col.key);
        continue;
      }
      // Anything allowed but not in the default-visible set starts hidden.
      if (ALLOWED_COLUMN_KEYS.has(col.key) && DEFAULT_VISIBLE_COLUMN_KEYS.has(col.key)) continue;
      s.add(col.key);
    }
    return s;
  }, [tableColumns, activeCheckout?.side]);

  // When hiddenColumns is null (no stored preference), use defaults
  const effectiveHiddenColumns = useMemo(() => hiddenColumns ?? defaultHiddenColumns, [hiddenColumns, defaultHiddenColumns]);

  // When the view is filtered to a single side — either via an active checkout
  // or via a single-value Side filter pill — force-show the matching side
  // amount column (CR/RD → Credit; DR/RC → Debit) regardless of the user's
  // stored column preferences. Andre's request: that column is the most
  // relevant signal in a single-side view, so don't let it stay hidden.
  const forcedSideColumnKeys = useMemo(() => {
    const sideValues: string[] = [];
    if (activeCheckout?.side) sideValues.push(activeCheckout.side);
    for (const value of Object.values(filters)) {
      if (value.size !== 1) continue;
      const v = [...value][0];
      if (v === 'CR' || v === 'DR' || v === 'RC' || v === 'RD') sideValues.push(v);
    }
    if (sideValues.length === 0) return undefined;
    // Multiple distinct sides selected (e.g. checkout=CR but filter=DR) —
    // ambiguous, fall back to the user's preference rather than guessing.
    const unique = new Set(sideValues);
    if (unique.size > 1) return undefined;
    const side = [...unique][0];
    const key = (side === 'CR' || side === 'RD') ? '__credit' : '__debit';
    return new Set([key]);
  }, [activeCheckout?.side, filters]);

  // Hidden set passed to the table strips out anything force-visible so the
  // column renders even when the user's stored prefs hide it.
  const tableHiddenColumns = useMemo(() => {
    if (!forcedSideColumnKeys) return effectiveHiddenColumns;
    let next: Set<string> | null = null;
    for (const key of forcedSideColumnKeys) {
      if (!effectiveHiddenColumns.has(key)) continue;
      if (!next) next = new Set(effectiveHiddenColumns);
      next.delete(key);
    }
    return next ?? effectiveHiddenColumns;
  }, [effectiveHiddenColumns, forcedSideColumnKeys]);

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

  // Apply checkout filters when checkout state changes.
  // When share filters are pending, merge them with baseFilters so they aren't lost
  // when filterDefinitions load (which causes baseFilters to recompute with live-mode keys).
  // Reads share data from refs (not props) to avoid re-runs when banner is dismissed.
  useEffect(() => {
    if (baseFilters) {
      if (shareFiltersRef.current && !shareFiltersConsumed.current) {
        setFilters({ ...baseFilters, ...shareFiltersRef.current });
        // Only mark consumed once filterDefinitions are loaded (live mode keys settled)
        if (!isLiveMode || filterDefinitions.length > 0) {
          shareFiltersConsumed.current = true;
          // Apply toggles at the same time
          if (shareTogglesRef.current) {
            setRelaxedMode(shareTogglesRef.current.compactMode);
            setIncrementalPagination(shareTogglesRef.current.incrementalPagination);
            setShowAttributes(shareTogglesRef.current.showAttributes);
          }
        }
      } else {
        setFilters({ ...baseFilters });
      }
      setShowOnlyUntagged(false);
      setShowOnlyMultiTagged(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilters]);

  // pill -> Show Only sync. Runs AFTER the [baseFilters] effect above so the
  // setFilters({ ...baseFilters }) reset doesn't blow our work away on the
  // very next render. Walks every LIST-type filter definition (Show Only is
  // typically the only one, but iterating defensively handles any backend
  // where boolean-flag columns are exposed across multiple defs) and ticks
  // whichever (Column, Value) pairs the pill recipe matches. The sync-key
  // ref keeps idle re-renders no-op; a new pill click OR a baseFilters
  // reset both produce a fresh key and retrigger the write.
  const lastPillShowOnlySyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (activePillFilters.length === 0) {
      lastPillShowOnlySyncRef.current = null;
      return;
    }
    if (filterDefinitions.length === 0) return;
    // Group ticks by the filter-def Tag they belong to. Each pill EQ
    // condition can resolve to one or more def matches; the Map keeps
    // them separated so different filter surfaces light up cleanly.
    //
    // Hard skip-list for row-context columns. Bank / Side EQ filters
    // would otherwise match the Bank / Side LIST defs (which expose
    // those exact Columns) and add the raw column name as a *value* in
    // the filter Set — translateFilters then ships it back to the server
    // as `Value: "BankSwiftCode"`, which filters everything out. The
    // pill recipe deliberately omits these now, but the guard keeps the
    // sync correct if any future recipe forgets.
    const CONTEXT_COLUMNS = new Set(['BankSwiftCode', 'Side']);
    // Three layers of comparison so a casing / punctuation / naming-style
    // drift between the pill recipe (PascalCase from the spec) and the
    // backend's GetFilters Show Only entries (sometimes `OpsIsMultiTagged`,
    // sometimes `OPS_IS_MULTI_TAG`, sometimes just `MultiTag`) still leads
    // to the same checkbox being ticked.
    //
    //   1. Exact column equality — cheapest, no false positives. This is
    //      what was already working for Untagged + Dead End.
    //   2. Normalised column equality — `lowercase + alphanumeric only`.
    //      Catches casing / separator drift.
    //   3. Intent match — split the column / label into CamelCase tokens,
    //      drop generic noise (Ops / Is / Has / Contains / Attribute(s) /
    //      Tag(s)) on both sides, and compare what's left. So
    //      `OpsIsMissingMandatoryAttributes` and a label "Missing
    //      Mandatory Attributes" both reduce to `missingmandatory` and
    //      tick the right checkbox even when the backend chose entirely
    //      different column name conventions.
    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const INTENT_NOISE = new Set([
      'ops', 'is', 'has', 'contains', 'attribute', 'attributes', 'tag', 'tags',
    ]);
    const intentOf = (s: string): string => {
      const camel = s
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[^a-zA-Z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => t.toLowerCase());
      return camel.filter((t) => !INTENT_NOISE.has(t)).join('');
    };
    const tickByTag = new Map<string, Set<string>>();
    for (const f of activePillFilters) {
      if (!('ColumnName' in f) || f.Operand !== 'EQ') continue;
      const fValueNorm = normalise(f.Value);
      // ColumnName can be a pipe-joined OR group (Problematic all-OR). Split
      // and match each segment against every LIST def's Values.
      for (const col of f.ColumnName.split('|')) {
        if (CONTEXT_COLUMNS.has(col)) continue;
        const colNorm = normalise(col);
        const colIntent = intentOf(col);
        for (const def of filterDefinitions) {
          if (def.Type !== 'LIST') continue;
          // Layer 1: exact.
          const exact = def.Values.find(
            (v) => v.Column === col && (v.Value ?? '') === f.Value,
          );
          // Layer 2: normalised column + value.
          const normalised = exact ?? def.Values.find(
            (v) =>
              normalise(v.Column) === colNorm &&
              normalise(v.Value ?? '') === fValueNorm,
          );
          // Layer 3: intent (via label or column) + normalised value.
          const intent = normalised ?? def.Values.find(
            (v) => {
              if (normalise(v.Value ?? '') !== fValueNorm) return false;
              if (colIntent && intentOf(v.Column) === colIntent) return true;
              if (colIntent && intentOf(v.Label ?? '') === colIntent) return true;
              return false;
            },
          );
          if (!intent) continue;
          if (!tickByTag.has(def.Tag)) tickByTag.set(def.Tag, new Set());
          // Store the def's actual Column string so ListEqDropdown's
          // `selected.has(v.Column)` check lines up regardless of which
          // layer found the match.
          tickByTag.get(def.Tag)!.add(intent.Column);
        }
      }
    }
    if (tickByTag.size === 0) return;
    // Build a sync key from (tag -> sorted columns) plus the current
    // baseFilters identity so a bank/side change retriggers the write.
    const key =
      [...tickByTag.entries()]
        .map(([tag, cols]) => `${tag}=${[...cols].sort().join(',')}`)
        .sort()
        .join(';') +
      `|${baseFilters ? Object.keys(baseFilters).sort().join(',') : ''}`;
    if (lastPillShowOnlySyncRef.current === key) return;
    lastPillShowOnlySyncRef.current = key;
    setFilters((prev) => {
      const next = { ...prev };
      for (const [tag, cols] of tickByTag) {
        next[tag] = cols;
      }
      return next;
    });
  }, [activePillFilters, filterDefinitions, baseFilters]);

  // Clear hidden tag specs when the checkout actually changes (release,
  // check-in, switching to a different bank/side). The initial-render
  // restore is handled by the useState lazy initializer above, so this
  // effect skips its mount-time fire — only a genuine change of bank/side
  // triggers the wipe.
  const lastCheckoutRef = useRef<{ bank: string | null; side: string | null }>({
    bank: activeCheckout?.bank ?? null,
    side: activeCheckout?.side ?? null,
  });
  useEffect(() => {
    const prev = lastCheckoutRef.current;
    const curr = { bank: activeCheckout?.bank ?? null, side: activeCheckout?.side ?? null };
    if (prev.bank === curr.bank && prev.side === curr.side) return;
    lastCheckoutRef.current = curr;
    setHiddenDefIds(new Set());
    setHiddenTagsPanelOpen(false);
  }, [activeCheckout?.bank, activeCheckout?.side]);

  // Persist the set on every change, scoped to the current checkout.
  useEffect(() => {
    const currBank = activeCheckout?.bank ?? null;
    const currSide = activeCheckout?.side ?? null;
    try {
      if (hiddenDefIds.size === 0 || currBank == null) {
        sessionStorage.removeItem(HIDDEN_DEF_IDS_STORAGE_KEY);
      } else {
        sessionStorage.setItem(
          HIDDEN_DEF_IDS_STORAGE_KEY,
          JSON.stringify({ bank: currBank, side: currSide, ids: [...hiddenDefIds] }),
        );
      }
    } catch { /* storage disabled — in-memory state still works */ }
  }, [hiddenDefIds, activeCheckout?.bank, activeCheckout?.side]);

  // Close the side panel once the last hidden tag spec is removed so it
  // doesn't linger as an empty drawer.
  useEffect(() => {
    if (hiddenDefIds.size === 0) setHiddenTagsPanelOpen(false);
  }, [hiddenDefIds]);

  // Live mode: fetch from API when filters or extraFilters change.
  // While a Backlog "edit" navigation is pending, skip auto-fetch — handleTagClick
  // will set tagClickState and this effect will re-fire with the scoped extra filter,
  // avoiding a broad fetch that would just be aborted.
  // Also wait for filterDefinitions to load before firing: while empty, baseFilters
  // uses sample-mode column-name keys that translateFilters drops, which would send
  // a request with no bank/side scope — pure waste, since the effect re-fires with
  // correct tag-name keys once definitions resolve.
  useEffect(() => {
    if (!isLiveMode) return;
    if (filterDefinitions.length === 0) return;
    if (activeCheckout?.pendingDefinitionId) return;
    const timer = setTimeout(() => {
      fetchPage(outgoingFilters, false, incrementalPagination ? undefined : 0, undefined, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
      if (!incrementalPagination) { setCurrentPage(0); setPageInputValue('1'); }
    }, 50);
    return () => clearTimeout(timer);
  }, [isLiveMode, filterDefinitions.length, outgoingFilters, fetchPage, incrementalPagination, activeExtraFilters, activeCheckout?.pendingDefinitionId]);

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
  // True while the TagSpecLibrarySave request is in flight. Disables the
  // wizard's Save button + keeps the modal open so the operator can see the
  // pending state instead of being dropped back to the table before the
  // backend has persisted the rule (which would cause GetMT940Transactions
  // to return stale, untagged rows).
  const [savingTagSpec, setSavingTagSpec] = useState(false);
  const [wizardInitialState, setWizardInitialState] = useState<WizardFormState | undefined>(undefined);
  const [editingDef, setEditingDef] = useState<TagSpecDefinition | undefined>(undefined);
  const [editingParentLib, setEditingParentLib] = useState<TagSpecLibrary | undefined>(undefined);

  // When the Rule Builder is open editing an existing definition, the
  // Detected Tag Specs picker locks to that definition: the entry is
  // pre-checked, every other entry is disabled, and Select/Deselect-all
  // are disabled. The ref tracks the prior lock so we only force-sync the
  // selection when the lock id actually changes — otherwise the effect
  // would fight any manual change the operator made between renders.
  const detectedTagsLockedToId =
    builderOpen && editingDef?.Id ? editingDef.Id : undefined;
  const prevDetectedTagsLockRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const next = detectedTagsLockedToId;
    const prev = prevDetectedTagsLockRef.current;
    if (next && next !== prev) {
      setCurrentTagFilterIds(new Set([next]));
    } else if (!next && prev) {
      setCurrentTagFilterIds(new Set());
    }
    prevDetectedTagsLockRef.current = next;
  }, [detectedTagsLockedToId]);
  const [wizardInitialStep, setWizardInitialStep] = useState<1 | 2 | 3 | 4 | undefined>(undefined);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [wizardFromCheckout, setWizardFromCheckout] = useState(false);

  // Download Center wiring. Optional because tests / preview mounts may
  // render TransactionsTab outside the provider; in that case the Export
  // button degrades to a disabled tooltip rather than crashing.
  const downloadCenter = useOptionalDownloadCenter();
  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    if (!downloadCenter) return;
    setExporting(true);
    try {
      // Mirror the EXACT filter shape the live fetch uses so the export
      // row set matches the visible row set 1:1:
      //   1. `outgoingFilters` — the UI's filter Sets, but blanked out
      //      when the call is scoped by a TagSpecDefinitionId (then the
      //      definition implies bank/side and standalone bank/side filters
      //      would over-constrain).
      //   2. `activeExtraFilters` — the synthetic extras the table fetch
      //      adds: a tag-click scope (filter by definition id), the
      //      Rule Builder's compiled REGEX from `buildRulesetFilters` when
      //      the builder is open, etc. Without this the export would
      //      return the whole checkout (e.g. 5000+ rows) even though the
      //      operator only sees 27 rows on screen because of the draft's
      //      conditions.
      const filtersPayload = [
        ...translateFilters(outgoingFilters, filterDefinitions),
        ...activeExtraFilters,
      ];
      await downloadCenter.triggerExport(filtersPayload, DEFAULT_SORTING);
      setToast({
        message: 'Export queued — check the Download Center when ready.',
        type: 'success',
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Failed to queue export.',
        type: 'error',
      });
    } finally {
      // Brief lockout so an accidental double-click can't fire two jobs in
      // the same breath. The button label says "Queueing…" during the lockout.
      setTimeout(() => setExporting(false), 1500);
    }
  }, [downloadCenter, outgoingFilters, filterDefinitions, activeExtraFilters]);

  // Drafts queued from inside the wizard. Held here so the save handler can
  // flush after `tagSpecLibrarySave` resolves; the same value is passed down
  // to the wizard tree via `WizardCommentDraftsProvider` for the icons and
  // panel to read.
  const wizardCommentDrafts = useWizardCommentDraftsState();

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
  // When editing an existing def, swap the saved def's rules/attributes with the
  // draft ones in place, so the live preview reflects in-progress edits (new
  // attributes, tweaked regex, modified conditions).
  // When creating a new def, append a synthetic preview library.
  const allLibraries: TagSpecLibrary[] = useMemo(() => {
    if (!tempDefinition) return effectiveLibraries;

    if (editingDef) {
      return effectiveLibraries.map((lib) => {
        const hasDef = lib.TagSpecDefinitions.some((d) => d.Id === editingDef.Id);
        if (!hasDef) return lib;
        return {
          ...lib,
          TagSpecDefinitions: lib.TagSpecDefinitions.map((d) =>
            d.Id === editingDef.Id
              ? {
                  ...d,
                  TagRuleExpressions: tempDefinition.TagRuleExpressions,
                  Attributes: tempDefinition.Attributes,
                }
              : d
          ),
        };
      });
    }

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
    // Put the draft FIRST so maps built with first-write-wins logic
    // (e.g. attrSourceMap in TransactionTable) pick up the live builder
    // values for attributes whose name also exists in saved rules.
    if (editingDef) {
      // When editing, keep the editingDef's original Tag/Id but swap in the
      // draft's rules and attributes (including Transformations). Otherwise
      // analysis.attributes — keyed by the original Tag — and tagDefinitions —
      // keyed under 'Preview' — would diverge, and getAttributeValue would
      // miss the draft's transformed value when looking up by def.Tag.
      const merged: TagSpecDefinition = {
        ...editingDef,
        TagRuleExpressions: tempDefinition.TagRuleExpressions,
        Attributes: tempDefinition.Attributes,
      };
      return [merged, ...tagDefinitions.filter(d => d.Id !== editingDef.Id)];
    }
    return [tempDefinition, ...tagDefinitions];
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

  // Rule creation only requires a transaction type. Rule expressions and
  // attributes are optional — a tag with only a transaction type matches
  // every row of that type, which is a valid use case.
  const builderHasTransactionType = builder.formState.transactionTypeCode.trim().length > 0;
  const canSubmitBuilder = builderHasTransactionType;

  // Centralized gate for the top-level Create / Save button. Three classes of
  // issue block save and each surfaces its own tooltip:
  //   1. Duplicates  — already flagged with red banners on the offending rows.
  //   2. Incomplete attributes — a row was added (via + Add Attribute) but the
  //      user hasn't finished filling required fields. Saving here would
  //      persist an empty-name attribute that shows up as a "New Attribute"
  //      form forever after.
  //   3. Incomplete rule sets — a rule group was added (via + Add Rule Set or
  //      + Add Condition) but the user left a placeholder. Same persistence
  //      problem as attributes.
  const builderHasDuplicates = useMemo(() => (
    hasDuplicateGroups(builder.formState.ruleGroups)
      || hasWithinGroupConditionDuplicates(builder.formState.ruleGroups)
      || hasDuplicateAttributeNames(builder.formState.attributes)
  ), [builder.formState.ruleGroups, builder.formState.attributes]);
  const builderHasIncompleteAttribute = useMemo(
    () => hasIncompleteAttribute(builder.formState.attributes),
    [builder.formState.attributes],
  );
  const builderHasIncompleteRule = useMemo(() => (
    hasIncompleteCondition(builder.formState.ruleGroups)
      || hasEmptyRuleGroup(builder.formState.ruleGroups)
  ), [builder.formState.ruleGroups]);

  // Set of condition / attribute IDs whose Save / Discard buttons are
  // currently visible (the row is mid-edit but uncommitted). Each editor
  // bubbles its local `editing` flag up via `onEditingChange`; cleanup on
  // unmount fires `false` so removed rows leave the set automatically.
  // While the set is non-empty the Create Rule button is blocked — saving
  // now would persist a stale form value while the visible editor still
  // shows an unsaved one.
  const [editingRowIds, setEditingRowIds] = useState<Set<string>>(new Set());
  const handleRowEditingChange = useCallback((id: string, editing: boolean) => {
    setEditingRowIds((prev) => {
      const has = prev.has(id);
      if (editing === has) return prev;
      const next = new Set(prev);
      if (editing) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const builderHasUnsavedRow = editingRowIds.size > 0;

  const canCreateFromBuilder =
    canSubmitBuilder
    && !builderHasDuplicates
    && !builderHasIncompleteAttribute
    && !builderHasIncompleteRule
    && !builderHasUnsavedRow;

  // Live preview: which existing tag definitions match the rule the user is
  // currently authoring? Fired only while the builder is open. Hook owns the
  // debouncing and abort logic.
  // The wizard's initial state defaults bankSwiftCode/side to seed values
  // (e.g. 'ARNBSARI'/'CR') that don't reflect the active checkout. For the
  // live preview we always want to scope to the bank/side the user is
  // actually checked out on, so override those two fields here. Other form
  // fields (rules, transactionTypeCode, ...) come straight from the wizard.
  // When the user is in tag-click "show all" mode they have explicitly
  // broadened past their rule's REGEX, so drop ruleGroups from the payload
  // — that strips the REGEX block and refires the API with bank/side/type
  // only, returning all tag definitions for that combination.
  const matchingTagsFormState = useMemo(() => {
    const base = activeCheckout
      ? { ...builder.formState, bankSwiftCode: activeCheckout.bank, side: activeCheckout.side }
      : builder.formState;
    if (tagClickState?.showingAll) {
      return { ...base, ruleGroups: [] };
    }
    return base;
  }, [builder.formState, activeCheckout, tagClickState?.showingAll]);
  const { ids: matchingTagIds, loading: matchingTagsLoading } = useMatchingTagIds(
    matchingTagsFormState,
    builderOpen,
  );

  // Read-only preview drawer for tags clicked in the "Existing Matching Tags"
  // section. Distinct from `handleTagClick` (which loads a tag into the builder
  // and would wipe in-progress draft state) — this surface must not disturb
  // whatever the user is currently authoring.
  const [previewDef, setPreviewDef] = useState<TagSpecDefinition | null>(null);



  // Analyze all rows

  const analyzedData: AnalyzedTransaction[] = useMemo(
    () =>
      transactions.map((row) => ({
        row,
        analysis: analyzeRow(row, allLibraries, isLiveMode),
      })).filter(item => {
        if (!builderOpen || !builderHasContent) return true;
        // When tag click applied a server-side tag filter, skip client-side
        // definition matching — the server already scoped results to this tag.
        if (tagClickState !== null) return true;
        if (editingDef) return item.analysis.matchedDefinitions.some(d => d.Id === editingDef.Id);
        return item.analysis.tags.includes('Preview');
      }),
    [transactions, allLibraries, tempDefinition, editingDef, tagClickState, builderOpen, builderHasContent, isLiveMode]
  );

  // One panel entry per hidden tag spec. We pull the first matching row's
  // matched-definition object so the badge + tooltip carry the correct
  // version / certainty / source — same lookup the in-row pill uses.
  const hiddenTagItems = useMemo(() => {
    if (hiddenDefIds.size === 0) return [] as Array<{ key: string; defId: string; name: string; def?: TagSpecDefinition }>;
    const out: Array<{ key: string; defId: string; name: string; def?: TagSpecDefinition }> = [];
    const seen = new Set<string>();
    // Prefer a row-resolved definition first (carries the version metadata
    // for the badge), then fall back to allDefinitions for any defId that
    // doesn't appear in the current data view.
    for (const item of analyzedData) {
      item.analysis.matchedDefinitions.forEach((def, ti) => {
        if (!def || !hiddenDefIds.has(def.Id) || seen.has(def.Id)) return;
        seen.add(def.Id);
        out.push({ key: def.Id, defId: def.Id, name: item.analysis.tags[ti] ?? def.Tag, def });
      });
    }
    for (const defId of hiddenDefIds) {
      if (seen.has(defId)) continue;
      const def = allDefinitions.find((d) => d.Id === defId);
      out.push({ key: defId, defId, name: def?.Tag ?? '(unknown tag spec)', def });
    }
    return out;
  }, [hiddenDefIds, analyzedData, allDefinitions]);

  // Add the picked tag spec IDs to the hidden set. The filter pass below
  // does the actual row dropping by walking each row's matched definitions
  // and checking against this set.
  const hideTagDefs = useCallback((defIds: string[]) => {
    if (defIds.length === 0) return;
    const newDefIds = defIds.filter((d) => !hiddenDefIds.has(d));
    if (newDefIds.length === 0) return;
    const primaryName = (() => {
      const target = newDefIds[0];
      for (const item of analyzedData) {
        const idx = item.analysis.matchedDefinitions.findIndex((d) => d?.Id === target);
        if (idx >= 0) return item.analysis.tags[idx] ?? item.analysis.matchedDefinitions[idx]?.Tag ?? null;
      }
      return allDefinitions.find((d) => d.Id === target)?.Tag ?? null;
    })();
    setHideBusy(true);
    setToast({
      message: newDefIds.length === 1 && primaryName
        ? `Hiding tag spec '${primaryName}'…`
        : `Hiding ${newDefIds.length} tag specs…`,
      type: 'success',
    });
    window.setTimeout(() => {
      setHiddenDefIds((prev) => {
        const next = new Set(prev);
        for (const d of newDefIds) next.add(d);
        return next;
      });
      setToast({
        message: newDefIds.length === 1 && primaryName
          ? `Tag spec '${primaryName}' hidden`
          : `${newDefIds.length} tag specs hidden`,
        type: 'success',
      });
      // Defer the busy clear into a separate task so the overlay
      // survives the heavy re-render triggered by setHiddenDefIds.
      // Bundling setHideBusy(false) in the same React batch would
      // hide the overlay BEFORE the new dataset is committed, leaving
      // the operator staring at an unresponsive screen mid-reflow.
      window.setTimeout(() => setHideBusy(false), 0);
    }, 250);
  }, [hiddenDefIds, analyzedData, allDefinitions]);

  const unhideTagDef = useCallback((defId: string, name: string) => {
    setHideBusy(true);
    setToast({ message: `Unhiding tag spec '${name}'…`, type: 'success' });
    window.setTimeout(() => {
      setHiddenDefIds((prev) => {
        if (!prev.has(defId)) return prev;
        const next = new Set(prev);
        next.delete(defId);
        return next;
      });
      setToast({ message: `Tag spec '${name}' restored`, type: 'success' });
      window.setTimeout(() => setHideBusy(false), 0);
    }, 250);
  }, []);

  const unhideAllTags = useCallback(() => {
    setHideBusy(true);
    setToast({ message: 'Unhiding all tag specs…', type: 'success' });
    window.setTimeout(() => {
      setHiddenDefIds(new Set());
      setToast({ message: 'All hidden tag specs restored', type: 'success' });
      window.setTimeout(() => setHideBusy(false), 0);
    }, 250);
  }, []);

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

    // Drop rows whose matched definitions include any hidden tag spec. Hide
    // Tag Spec is a pure view-layer filter — server payload is unchanged so
    // the operator can restore the spec from the side panel.
    if (hiddenDefIds.size > 0) {
      result = result.filter(
        (item) => !isRowHidden(item.analysis.matchedDefinitions, hiddenDefIds),
      );
    }

    return result;
  }, [analyzedData, showOnlyUntagged, showOnlyMultiTagged, showOnlyDeadEnd, filters, isLiveMode, builderOpen, builder.formState.transactionTypeCode, hiddenDefIds]);

  // Count of loaded rows that match any hidden tag spec. Drives the "live
  // total minus hidden" adjustment in the Transactions header AND the
  // pagination footer counts; also used to overfetch +N batches so the
  // requested increment is met in terms of VISIBLE rows. Mirrors the
  // backend's OpsTagSpecDefinitionId IN filter logic (used by
  // hiddenTotalCount) so loadedNow and totalNow stay on the same scope.
  const hiddenLoadedCount = useMemo(() => {
    if (hiddenDefIds.size === 0) return 0;
    let n = 0;
    for (const item of analyzedData) {
      if (isRowHidden(item.analysis.matchedDefinitions, hiddenDefIds)) n++;
    }
    return n;
  }, [hiddenDefIds, analyzedData]);

  // True count of rows in the current filter scope that match a hidden
  // definition — fetched from the backend, not bounded by what's loaded.
  // Drives the header's "· N hidden" suffix so it doesn't drift with
  // pagination state. `hiddenLoadedCount` is still the right number for the
  // visible-row math and +N overfetch — see filteredData / fetchPage callers.
  const [hiddenTotalCount, setHiddenTotalCount] = useState<number>(0);
  useEffect(() => {
    if (!isLiveMode) {
      // Sample mode loads everything client-side, so hiddenLoadedCount IS
      // the true hidden count — no backend call required.
      setHiddenTotalCount(hiddenLoadedCount);
      return;
    }
    if (hiddenDefIds.size === 0) {
      setHiddenTotalCount(0);
      return;
    }
    // Multi-value `IN` uses pipe-joined Value, matching the codebase
    // convention in translateFilters (LIST/IN branch joins selected values
    // with '|'). Comma here would be interpreted as a literal substring
    // and silently return 0.
    const hiddenFilter: FilterProperty[] = [
      {
        ColumnName: 'OpsTagSpecDefinitionId|OpsMultiTags.TagSpecDefinitionId',
        Value: [...hiddenDefIds].join('|'),
        Operand: 'IN',
      },
    ];
    let cancelled = false;
    fetchCount(filters, hiddenFilter).then((count) => {
      if (cancelled) return;
      setHiddenTotalCount(count ?? 0);
    });
    return () => { cancelled = true; };
  }, [isLiveMode, filters, hiddenDefIds, fetchCount, hiddenLoadedCount]);

  // Matching Tag Specs: fire GetAllTransactionTags eagerly when the operator
  // enters Transactions with an active checkout. The result is the unique set
  // of OpsTagSpecIds that currently match transactions for the checked-out
  // bank/side context. Surfaces in the filter row as a distinct pill and
  // drives the picker modal. The call is gated on isLiveMode + activeCheckout
  // so audit / sample / no-checkout sessions are no-ops.
  const [matchingTagDefIds, setMatchingTagDefIds] = useState<string[]>([]);
  // Bumped by the filter-row Refresh button so the Detected Tag Specs list
  // re-fetches alongside `fetchFilterDefinitions` — matches the operator's
  // mental model of "Refresh = pull everything in the filter row again".
  const [matchingTagReloadKey, setMatchingTagReloadKey] = useState(0);
  // Loading flag scoped to the GetAllTransactionTags call so the filter row
  // can render a skeleton on the Detected Tag Specs pill while the list is
  // being refetched. Only true during an active in-flight request.
  const [matchingTagsListLoading, setMatchingTagsListLoading] = useState(false);
  useEffect(() => {
    if (!isLiveMode || !activeCheckout) {
      setMatchingTagDefIds([]);
      setMatchingTagsListLoading(false);
      return;
    }
    const controller = new AbortController();
    setMatchingTagsListLoading(true);
    (async () => {
      try {
        await refreshIfNeeded();
        const authHeader = getAuthHeaders().Authorization ?? '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
        if (!token) return;
        const tepHeaders: TepHeaders = {
          apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
          userId: userId ?? '',
          tenantCode: tepConfig.ttpTenantCode,
          languageCode: tepConfig.languageCode,
          timeZone: tepConfig.timeZone,
          requestId: tepConfig.ttpRequestId,
        };
        const filteringProperties: FilterProperty[] = [
          { ColumnName: 'BankSwiftCode', Value: activeCheckout.bank, Operand: 'EQ' },
          { ColumnName: 'Side', Value: activeCheckout.side, Operand: 'EQ' },
        ];
        const ids = await getAllTransactionTags(
          { FilteringProperties: filteringProperties },
          token,
          tepHeaders,
          controller.signal,
        );
        if (!controller.signal.aborted) setMatchingTagDefIds(ids);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('GetAllTransactionTags failed', err);
        }
      } finally {
        if (!controller.signal.aborted) setMatchingTagsListLoading(false);
      }
    })();
    return () => controller.abort();
  }, [isLiveMode, activeCheckout, refreshIfNeeded, getAuthHeaders, userId, tepConfig, matchingTagReloadKey]);

  // Resolve matching IDs to definitions via the local libraries cache.
  // Definitions not in the cache stay surfaced by raw Id so the operator
  // can still scope the table; the modal renders an "(unknown)" badge.
  // Sorted alphabetically by tag name so long lists stay scannable;
  // unresolved entries (no def in the local cache) sink to the bottom.
  const matchingTagEntries = useMemo(() => {
    if (matchingTagDefIds.length === 0) {
      return [] as Array<{ id: string; def?: TagSpecDefinition; version?: number }>;
    }
    const byId = new Map<string, TagSpecDefinition>();
    for (const lib of allLibraries) {
      for (const def of lib.TagSpecDefinitions) byId.set(def.Id, def);
    }
    const entries = matchingTagDefIds.map((id) => ({
      id,
      def: byId.get(id),
      version: definitionVersions.get(id)?.version,
    }));
    entries.sort((a, b) => {
      if (!a.def && b.def) return 1;
      if (a.def && !b.def) return -1;
      const an = a.def?.Tag ?? a.id;
      const bn = b.def?.Tag ?? b.id;
      return an.localeCompare(bn, undefined, { sensitivity: 'base' });
    });
    return entries;
  }, [matchingTagDefIds, allLibraries, definitionVersions]);

  // Deliver +N visible rows. Always appends with the default page size so
  // pageIndex in fetchPage (derived from loadedCount/pageSize) increments
  // cleanly — varying pageSize mid-session would round back to an already-
  // fetched page and produce duplicate rows. Two loops in one path:
  //   - When no hide filter is active, every appended row counts as
  //     visible; we stop as soon as visibleAdded >= size.
  //   - When the hide filter is active, only rows that survive the
  //     client-side hide check count toward visibleAdded; the loop keeps
  //     fetching pages until we hit size or the backend is exhausted.
  // Excess raw rows beyond the target are trimmed so the visible delta
  // lands on exactly N.
  const loadNVisible = useCallback(async (size: number) => {
    if (!isLiveMode) {
      setVisibleCount((c) => c + size);
      return;
    }
    const extras = activeExtraFilters.length > 0 ? activeExtraFilters : undefined;
    const hasHideFilter = hiddenDefIds.size > 0;
    let visibleAdded = 0;
    let attempts = 0;
    const totalBackend = totalTransactionsCount ?? transactions.length;
    const remainingBackend = Math.max(0, totalBackend - transactions.length);
    const maxAttempts = Math.max(1, Math.ceil(remainingBackend / BATCH_SIZE) + 2);
    let done = false;
    while (!done && visibleAdded < size && attempts < maxAttempts) {
      // Don't pass pageSize — let fetchPage use PAGE_SIZE so pageIndex
      // increments cleanly from one append to the next.
      const newRows = await fetchPage(outgoingFilters, true, undefined, undefined, extras);
      if (newRows.length === 0) break;
      for (let i = 0; i < newRows.length; i++) {
        const isVisible = hasHideFilter
          ? !isRowHidden(analyzeRow(newRows[i], allLibraries, isLiveMode).matchedDefinitions, hiddenDefIds)
          : true;
        if (isVisible) visibleAdded++;
        if (visibleAdded >= size) {
          const excess = newRows.length - 1 - i;
          if (excess > 0) trimLoadedTransactions(excess);
          done = true;
          break;
        }
      }
      attempts++;
    }
  }, [isLiveMode, activeExtraFilters, hiddenDefIds, fetchPage, outgoingFilters, transactions.length, totalTransactionsCount, allLibraries, trimLoadedTransactions]);

  // Auto-fetch when the hide-tag-spec filter drops the visible row count
  // below the default page size and more rows are available on the backend.
  // Originally this only fired on `loadedNow === 0` (empty table), but
  // operators expect a hide to leave the page looking full — hiding a tag
  // on a 50-row page that consumes 25 of them should refill back to 50
  // automatically, not leave a half-empty view. The fetch is capped at
  // BATCH_SIZE minus what's still visible, or at the remaining total when
  // the backend has fewer left than that. The signature ref prevents
  // re-firing on identical (loaded, filters, hidden) snapshots; if
  // `loadNVisible` appends raw rows that are still hidden,
  // transactions.length advances and the signature changes so the effect
  // keeps trying until the target is met or `liveHasMore` flips false.
  const autoFetchSignatureRef = useRef<string>('');
  useEffect(() => {
    if (!isLiveMode || loading || builderOpen) return;
    if (hiddenDefIds.size === 0) return;
    if (!liveHasMore) return;
    const loadedRaw = transactions.length;
    const totalRaw = totalTransactionsCount ?? loadedRaw;
    const loadedNow = Math.max(0, loadedRaw - hiddenLoadedCount);
    const totalNow = Math.max(0, totalRaw - hiddenTotalCount);
    const target = Math.min(BATCH_SIZE, totalNow);
    if (loadedNow >= target) return;
    const sig = `${loadedRaw}|${totalRaw}|${hiddenTotalCount}|${[...hiddenDefIds].sort().join(',')}`;
    if (autoFetchSignatureRef.current === sig) return;
    autoFetchSignatureRef.current = sig;
    loadNVisible(target - loadedNow);
  }, [isLiveMode, loading, builderOpen, hiddenDefIds, transactions.length, totalTransactionsCount, hiddenLoadedCount, hiddenTotalCount, liveHasMore, loadNVisible]);

  // Reset visible count / page when filtered data length changes
  // In live + classic pagination mode, data replaces on every page nav — don't reset page from here
  const filteredLen = filteredData.length;

  // Displayed loaded / total / hidden counts shared between the header label
  // and the pagination footer. Client filter (matchedDefinitions) is
  // authoritative for what the operator sees, so loadedNow drives the
  // invariant. The backend's hiddenTotalCount can over-count when persisted
  // tag IDs reference hidden defs that re-evaluate to non-hidden ones via
  // analyzeRow — clamp the displayed hidden so `loadedNow + hidden = total`
  // and `loadedNow <= totalNow` always hold.
  const displayCounts = useMemo(() => {
    const loadedRaw = isLiveMode ? transactions.length : visibleCount;
    const totalRaw = isLiveMode ? (totalTransactionsCount ?? transactions.length) : filteredLen;
    const loadedNow = Math.max(0, loadedRaw - hiddenLoadedCount);
    const hiddenDisplay = Math.min(hiddenTotalCount, Math.max(0, totalRaw - loadedNow));
    const totalNow = Math.max(loadedNow, totalRaw - hiddenDisplay);
    return { loadedRaw, totalRaw, loadedNow, totalNow, hiddenDisplay };
  }, [isLiveMode, transactions.length, visibleCount, totalTransactionsCount, filteredLen, hiddenLoadedCount, hiddenTotalCount]);

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
    // Drafts authored on the Rule Builder rows are tied to this session — drop
    // them so they don't leak into the next builder open.
    wizardCommentDrafts.clearAll();
    // Restore filters from before tag click, ensuring base filters (bank/side) are always preserved
    if (tagClickState !== null) {
      setFilters({ ...baseFilters, ...tagClickState.preFilters });
      setTagClickState(null);
    }
  }, [builder, tagClickState, baseFilters, wizardCommentDrafts]);

  // Delete target for the in-builder Delete button — mirrors the Backlog
  // tab's per-row delete. Confirmation dialog displays the Tag name, and on
  // confirm dispatches the same DELETE action so the change tracker picks it
  // up for the next checkout save.
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; tag: string } | null>(null);
  const handleRequestDelete = useCallback(() => {
    if (!editingDef) return;
    setDeleteTarget({ id: editingDef.Id, tag: editingDef.Tag });
  }, [editingDef]);
  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    dispatch({ type: 'DELETE', payload: { definitionId: deleteTarget.id } });
    setToast({ message: `Tag '${deleteTarget.tag}' deleted`, type: 'success' });
    setDeleteTarget(null);
    // Close the builder and restore pre-click filters — same path as Discard.
    setBuilderOpen(false);
    setEditingDef(undefined);
    setEditingParentLib(undefined);
    builder.resetForm();
    wizardCommentDrafts.clearAll();
    if (tagClickState !== null) {
      setFilters({ ...baseFilters, ...tagClickState.preFilters });
      setTagClickState(null);
    }
  }, [deleteTarget, dispatch, builder, tagClickState, baseFilters, wizardCommentDrafts]);

  const handleWizardSave = useCallback(async (result: WizardFormResult) => {
    // Persist to the backend FIRST. In live mode `analyzeRow` defers to the
    // row's OpsTag* fields for saved libraries, so any GetMT940Transactions
    // call fired before TagSpecLibrarySave completes comes back with rows
    // tagged under the old rule set. Doing the dispatch / wizard close /
    // filter reset only after the save ensures the refetch (triggered by
    // setFilters below, or the explicit fetchPage when there's no filter
    // change to piggyback on) hits a backend that already has the new rule.
    if (activeCheckout) {
      setSavingTagSpec(true);
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
          // Find the inProgressLib and apply the change manually (dispatch is
          // async in React batching).
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
            // Re-baseline the local cache so baseline + current both reflect
            // what's now on the server, preventing stale draft state from
            // overriding fresh API responses on future fetches.
            saveBaseline(libToSave);

            // The TagSpec is now persisted, so wizard-deferred comment drafts
            // can safely be flushed against the now-real definition / rule /
            // attribute ids. Failures here don't unwind the save: the user
            // sees a partial-failure toast and the rule sticks.
            if (wizardCommentDrafts.pendingCount > 0 && userId) {
              const { posted, failed } = await wizardCommentDrafts.flushAll(
                (payload) => setTagSpecComment(payload, token, tepHeaders),
                result.commentTargetByFormKey,
                userId,
              );
              if (failed > 0) {
                setToast({
                  message: `Saved tag, but ${failed} comment${failed === 1 ? '' : 's'} failed to post. Try re-adding from Backlog.`,
                  type: 'error',
                });
              } else if (posted > 0) {
                // Drop the success toast a tick later so the parent save toast
                // (which fires below) doesn't overwrite it instantly.
                setTimeout(() => {
                  setToast({
                    message: `${posted} comment${posted === 1 ? '' : 's'} posted to the rule.`,
                    type: 'success',
                  });
                }, 1200);
              }
              wizardCommentDrafts.clearAll();
            }
          }
        }
      } catch (err) {
        console.error('Failed to save tag spec library:', err);
        setToast({ message: `Failed to save tag '${result.definition.Tag}'. Please try again.`, type: 'error' });
        setSavingTagSpec(false);
        return; // Keep the wizard open so the operator can retry.
      }
      setSavingTagSpec(false);
    }

    // Save succeeded — now safe to flip the local state.
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

    // The saved tag changes the available filter options (e.g. tag-name and
    // certainty filters key off the live definitions), so refresh GetFilters
    // before re-fetching the transaction list on return to the table.
    if (isLiveMode) {
      await fetchFilterDefinitions();
    }

    if (tagClickState !== null) {
      // Filter change naturally triggers the live-mode fetchPage useEffect,
      // which now hits a backend that already has the saved rule.
      setFilters({ ...baseFilters, ...tagClickState.preFilters });
      setTagClickState(null);
    } else if (isLiveMode) {
      // No filter change to piggyback on — explicitly refetch so the freshly
      // saved rule's tags appear on the transactions list immediately.
      fetchPage(outgoingFilters, false, incrementalPagination ? undefined : 0, undefined, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
    }
  }, [dispatch, builder, editingDef, tagClickState, baseFilters, activeCheckout, libraries, refreshIfNeeded, getAuthHeaders, userId, tepConfig, saveBaseline, isLiveMode, outgoingFilters, fetchPage, incrementalPagination, activeExtraFilters, fetchFilterDefinitions, wizardCommentDrafts]);

  const handleWizardClose = useCallback(() => {
    setWizardOpen(false);
    setWizardInitialState(undefined);
    setWizardInitialStep(undefined);
    setWizardFromCheckout(false);
    // Intentionally NOT clearing wizardCommentDrafts here. The wizard is a
    // review surface launched from the in-line Rule Builder; cancelling the
    // wizard returns the operator to the builder with their form state and
    // queued drafts intact. Drafts are cleared by `handleDiscard` (Rule
    // Builder Discard), `handleConfirmDelete`, and after a successful save.
  }, []);

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
      const formState = fromExistingDefinition(foundDef, foundLib, extractionMethods);
      builder.setFormState(formState);
      setEditingDef(foundDef);
      setEditingParentLib(foundLib);
      setBuilderOpen(true);

      if (isLiveMode && filterDefinitions.length > 0 && foundDef.Id) {
        const tagFilterDef = filterDefinitions.find((d) =>
          d.Type === 'LIST' && d.Values.some((v) => v.Value === tagName)
        );
        const tagFilterKey = tagFilterDef?.Tag ?? '';

        // Save pre-click filters and set tag click state (don't modify filters — extraFilters handles the definition ID scoping).
        // Seed preFilters from baseFilters (not `filters`) so bank/side are always correct —
        // when this fires on Backlog-edit navigation, `filters` may still be stale from before
        // filterDefinitions loaded, but `baseFilters` is always the memoised current bank/side map.
        setTagClickState({
          preFilters: { ...(baseFilters ?? {}) },
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

        // The live-mode fetch effect will pick up the new activeExtraFilters
        // (scoped by definition ID) after state settles — no need to fire the
        // page fetch directly here (it would just be aborted by the effect).
        // The tagNameCount refresh runs in a separate effect below, keyed on
        // `filters` so it re-fires when the operator narrows the table.
      }
    }
  }, [libraries, builder, isLiveMode, filterDefinitions, baseFilters, extractionMethods]);

  // Recompute tagNameCount (the "rows tagged with this name across the bank/side"
  // count powering the delta-banner) whenever the operator's filters change.
  // Respects user filters per UX request — passing `filters` (rather than the
  // bank/side-only `baseFilters`) so currency/date-range/etc. narrow the count.
  // `fetchCount` runs `translateFilters` internally, so stale pre-live-mode
  // keys are dropped before hitting the backend. The deps deliberately key on
  // the inner fields of tagClickState (not the whole object) so that the
  // tagNameCount setter below doesn't loop the effect.
  const tagClickName = tagClickState?.tagName;
  const countableTagClick = !!tagClickState
    && !tagClickState.showingAll
    && !tagClickState.rulesetApplied;
  useEffect(() => {
    if (!isLiveMode) return;
    if (!countableTagClick || !tagClickName) return;
    const tagNameFilter: FilterProperty[] = [
      { ColumnName: 'OpsTag|OpsMultiTags.Tag', Value: tagClickName, Operand: 'IN' },
    ];
    let cancelled = false;
    fetchCount(filters, tagNameFilter).then((count) => {
      if (cancelled) return;
      setTagClickState((prev) => (prev && prev.tagName === tagClickName ? { ...prev, tagNameCount: count } : prev));
    });
    return () => { cancelled = true; };
  }, [isLiveMode, fetchCount, filters, tagClickName, countableTagClick]);

  // Auto-open a definition's rule builder when navigating from the Backlog with a pendingDefinitionId.
  // Wait for both libraries and (in live mode) filter definitions to load so handleTagClick
  // can set up the scoped API fetch on its first pass.
  useEffect(() => {
    if (!pendingDefIdRef.current || libraries.length === 0) return;
    if (isLiveMode && filterDefinitions.length === 0) return;
    const defId = pendingDefIdRef.current;
    pendingDefIdRef.current = null;

    let tagName: string | undefined;
    for (const lib of libraries) {
      const def = lib.TagSpecDefinitions.find(d => d.Id === defId);
      if (def) { tagName = def.Tag; break; }
    }
    if (tagName) {
      handleTagClick(tagName, defId);
    }
    onClearPendingDefinition?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraries, filterDefinitions, isLiveMode]);

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
    <WizardCommentDraftsProvider value={wizardCommentDrafts}>
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
          {(() => {
            // Header count is the raw backend total for the current filter
            // scope. The "· N hidden" suffix is the BACKEND-aware count of
            // rows in the same filter scope that match a hidden definition —
            // not bounded by what's loaded — so it doesn't drift on
            // pagination. "all hidden" surfaces when hidden covers the
            // entire filter scope.
            const displayed = builderOpen && builderHasContent
              ? filteredData.length
              : isLiveMode && totalTransactionsCount != null
                ? totalTransactionsCount
                : filteredData.length;
            const hiddenSuffix = (() => {
              if (builderOpen) return '';
              if (displayCounts.hiddenDisplay <= 0) return '';
              if (displayed > 0 && displayCounts.hiddenDisplay >= displayed) return ' · all hidden';
              return ` · ${displayCounts.hiddenDisplay.toLocaleString()} hidden`;
            })();
            return (
              <span className='text-sm mr-5 min-w-10 text-primary-dark whitespace-nowrap'>
                ({displayed.toLocaleString()}{hiddenSuffix})
              </span>
            );
          })()}
          <div className="flex items-center gap-4">
            <Toggle label="Compact mode" checked={relaxedMode} onChange={setRelaxedMode} />
            <Toggle label="Incremental pagination" checked={incrementalPagination} onChange={(v) => {
              setIncrementalPagination(v);
              setCurrentPage(0);
              setPageInputValue('1');
              setVisibleCount(BATCH_SIZE);
              if (!v && isLiveMode) fetchPage(outgoingFilters, false, 0, undefined, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
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
          {!builderOpen && !isLiveMode && !isAudit && <Button variant="primary" size="xs" onClick={() => {
            fileInputRef.current?.click()
          }}>
            Upload Data
          </Button>}
          {isCustomData && !isLiveMode && !isAudit && (
            <Button variant="danger" size="xs" onClick={resetToSample}>
              Reset to Sample
            </Button>
          )}
          {/* Export — only meaningful in live mode (the backend owns the
              dataset); hidden in sample/upload modes where there's no
              server-side data to export. Also hidden while the Rule Builder
              is open so the toolbar focuses on builder controls. */}
          {isLiveMode && downloadCenter && !builderOpen && (() => {
            const exportBtn = (
              <Button
                variant="secondary"
                size="xs"
                onClick={handleExport}
                disabled={exporting}
                data-tour="export-transactions"
                className="whitespace-nowrap inline-flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {exporting ? 'Queueing…' : 'Export'}
              </Button>
            );
            // Suppress the "Queue an export…" tooltip while a queue is
            // already in flight — the button's own "Queueing…" label
            // already communicates that state, and a tooltip telling the
            // operator to do what they just did is noise.
            return exporting
              ? exportBtn
              : <Tooltip content="Queue an export of the current filtered view" placement="bottom">{exportBtn}</Tooltip>;
          })()}
          {!builderOpen && !isAudit && (
            activeCheckout && !isReadOnly ? (
              <Button
                data-tour="open-rule-builder"
                variant="secondary"
                size="xs"
                className="whitespace-nowrap"
                onClick={() => {
                  setShowOnlyUntagged(false)
                  setShowOnlyMultiTagged(false)
                  setBuilderOpen(true)
                }}
              >
                Create a Rule
              </Button>
            ) : (
              <Tooltip content={isReadOnly && ownerName ? `Checked out by ${ownerName} — read-only` : 'You need to check out a bank/side combination from the Stats page first'} placement="bottom">
                <span>
                  <Button
                    data-tour="open-rule-builder"
                    variant="secondary"
                    size="xs"
                    className="whitespace-nowrap"
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
        leadingActionSlot={isLiveMode && activeCheckout && (matchingTagEntries.length > 0 || matchingTagsListLoading) ? (
          <CurrentTagsDropdown
            entries={matchingTagEntries}
            selectedIds={currentTagFilterIds}
            onChange={setCurrentTagFilterIds}
            loading={matchingTagsListLoading}
            lockedToId={detectedTagsLockedToId}
          />
        ) : null}
        // The Detected Tag Specs picker lives outside DynamicFilters' own
        // state but reads as part of the same filter row to the operator —
        // fold it into the Clear-filters affordance so one click resets
        // everything the operator can see.
        extraActiveFilterCount={currentTagFilterIds.size + (activePillFilters.length > 0 ? 1 : 0)}
        onClearExtraFilters={() => { setCurrentTagFilterIds(new Set()); setActivePillFilters([]); }}
        endSlot={(isLiveMode || tableColumns.length > 0) ? (
          <div className="flex items-center gap-2">
            {isLiveMode && (
              <button
                type="button"
                onClick={() => {
                  if (filterDefinitionsLoading) return;
                  fetchFilterDefinitions();
                  // Detected Tag Specs comes from a separate endpoint
                  // (`GetAllTransactionTags`), so the Refresh button must
                  // also re-fire that fetch — otherwise a stale tag-spec
                  // list survives the refresh.
                  setMatchingTagReloadKey((k) => k + 1);
                  // Also clear the operator's Detected Tag Specs selection
                  // so Refresh acts as a clean slate, matching the Clear
                  // Filters contract. Skip the clear when the filter is
                  // locked to the current edit (rule builder open) — the
                  // lock should survive a Refresh click.
                  if (!detectedTagsLockedToId) {
                    setCurrentTagFilterIds(new Set());
                  }
                }}
                disabled={filterDefinitionsLoading}
                title="Refresh filters"
                aria-label="Refresh filters"
                className="text-xs px-2.5 py-1.5 rounded-lg border bg-surface border-border-strong text-body hover:bg-surface-hover transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg
                  className={`w-3.5 h-3.5 ${filterDefinitionsLoading ? 'animate-spin' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.062 9A8.001 8.001 0 0119.418 7M18.938 15A8.001 8.001 0 014.582 17" />
                </svg>
              </button>
            )}
            {isLiveMode && inProgressLib?.Id && (
              <CommentSearchTrigger onClick={() => setSearchPanelOpen(true)} title="Search comments" size="sm" />
            )}
            {tableColumns.length > 0 && (
              <ColumnPicker columns={tableColumns} hiddenColumns={effectiveHiddenColumns} onChange={setHiddenColumns} columnOrder={columnOrder} onColumnOrderChange={setColumnOrder} defaultHiddenColumns={defaultHiddenColumns} onReset={handleColumnReset} lockedVisibleKeys={forcedSideColumnKeys} />
            )}
          </div>
        ) : undefined}
      />
      {/* )} */}

      {/* Rule builder panel */}
      {builderOpen && (() => {
        // In edit mode `editingParentLib` is set when the user clicked into an
        // existing rule. In create mode the library is the in-progress one
        // matching the active checkout — fall back to that so wizard-style
        // comment scoping works for newly drafted rules too.
        const ruleBuilderLibraryId = editingParentLib?.Id ?? inProgressLib?.Id ?? null;
        const ruleBuilderAuthHeader = getAuthHeaders().Authorization ?? '';
        const ruleBuilderAuthToken = ruleBuilderAuthHeader.startsWith('Bearer ')
          ? ruleBuilderAuthHeader.slice('Bearer '.length)
          : null;
        const ruleBuilderTepHeaders: TepHeaders = {
          apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
          userId: userId ?? '',
          tenantCode: tepConfig.ttpTenantCode,
          languageCode: tepConfig.languageCode,
          timeZone: tepConfig.timeZone,
          requestId: tepConfig.ttpRequestId,
        };
        const builderPanel = (
        <div data-tour="rule-builder-panel" ref={builderRef} className="flex flex-col mb-6 border border-primary/20 rounded-xl bg-primary/5 overflow-hidden">
          {isReadOnly && ownerName && (
            <div className="flex items-center px-5 py-2 bg-amber-50 border-b border-amber-200 dark:bg-amber-900/20 dark:border-amber-700">
              <svg className="w-4 h-4 text-amber-500 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              <span className="text-sm text-amber-800 dark:text-amber-300">
                Viewing rule owned by <span className="font-semibold">{ownerName}</span> — read-only
              </span>
            </div>
          )}
          <div className="px-5 py-3 bg-primary/15 border-b border-primary/20 flex items-center justify-between gap-4">
            {(() => {
              // Current tag context: edit mode wins (the user is explicitly
              // working on this definition), otherwise fall back to the tag a
              // user clicked in the table to drill into.
              const currentTagName = editingDef?.Tag ?? tagClickState?.tagName ?? null;
              const currentTagId = editingDef?.Id ?? tagClickState?.definitionId ?? null;
              const collapseToggle = (
                <button
                  type="button"
                  onClick={() => setBuilderCollapsed((v) => !v)}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-all duration-200 ease-out"
                  title={builderCollapsed ? 'Expand the rule builder' : 'Collapse the rule builder to give the table more space'}
                  aria-label={builderCollapsed ? 'Expand rule builder' : 'Collapse rule builder'}
                  aria-expanded={!builderCollapsed}
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ease-out ${builderCollapsed ? '-rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.25}
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              );
              if (currentTagName) {
                return (
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="flex items-center h-3.5">{collapseToggle}</span>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-dark/70 leading-3.5">
                        Rule Builder
                      </div>
                      <div className="flex items-center gap-2.5 flex-wrap mt-1">
                        <span className="font-mono text-sm font-semibold text-primary-dark truncate">
                          {currentTagName}
                        </span>
                        {currentTagId && (
                          <CopyableId id={currentTagId} truncateAt={12} tone="default" />
                        )}
                        {ruleBuilderLibraryId && (
                          <WizardCommentIconButton
                            formKey={WIZARD_DEFINITION_FORM_KEY}
                            kind="definition"
                            targetLabel={currentTagName}
                            persistedTarget={
                              editingDef?.Id
                                ? {
                                    TagSpecLibraryId: ruleBuilderLibraryId,
                                    TagSpecDefinitionId: editingDef.Id,
                                  }
                                : null
                            }
                            size="xs"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div className="flex items-start gap-2 min-w-0">
                  <span className="flex items-center h-5">{collapseToggle}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-sm font-semibold text-primary-dark leading-5">Rule Builder</h3>
                      {ruleBuilderLibraryId && (
                        <WizardCommentIconButton
                          formKey={WIZARD_DEFINITION_FORM_KEY}
                          kind="definition"
                          targetLabel={builder.formState.tag || 'New tag'}
                          persistedTarget={null}
                          size="xs"
                          title="Comment on this tag (queued until Save)"
                        />
                      )}
                    </div>
                    <p className="text-xs text-primary-dark">
                      Build rules and see their effect on the table in real time.
                    </p>
                  </div>
                </div>
              );
            })()}
            <div data-tour="builder-transaction-type" className="flex items-center gap-2 flex-wrap shrink-0">
              <label className="text-xs font-medium text-primary-dark whitespace-nowrap">
                Transaction Type<span className="text-red-500 ml-0.5" aria-hidden>*</span>
              </label>
              <TransactionTypePicker
                value={builder.formState.transactionTypeCode}
                onChange={(val) => builder.updateBasicInfo({ transactionTypeCode: val })}
                filterDefinitions={filterDefinitions}
                disabled={isReadOnly}
                triggerClassName="!py-1 !text-xs !max-w-[220px]"
              />
              <label className="text-xs font-medium text-primary-dark whitespace-nowrap ml-2">
                Tag Name
              </label>
              <div className="min-w-[140px] max-w-[160px]">
                <SearchableSelect
                  value={builder.formState.tag}
                  onChange={(val) => builder.updateBasicInfo({ tag: val })}
                  options={tagNameOptions}
                  placeholder="Select or type a tag…"
                  disabled={isReadOnly}
                  clearable
                  triggerClassName="!py-1 !text-xs"
                />
              </div>
            </div>
            <div className="flex flex-col md:flex-row items-center gap-2 shrink-0 whitespace-nowrap">
              {!isReadOnly && !editingDef && (
                <DuplicateRulesButton
                  currentRuleGroupCount={builder.formState.ruleGroups.length}
                  currentAttributeCount={builder.formState.attributes.length}
                  onApplyTemplate={builder.applyTemplate}
                  size="xs"
                  className="whitespace-nowrap"
                  data-tour="builder-duplicate-rules"
                />
              )}
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setLovBrowserOpen(true)}
                className="whitespace-nowrap"
                title="Browse LOV reference data without leaving the rule builder"
              >
                Browse LOVs
              </Button>
              <Button variant="ghost" size="xs" onClick={handleDiscard} className="whitespace-nowrap">
                {isReadOnly ? 'Close' : 'Discard'}
              </Button>
              {!isReadOnly && tagClickState && (
                !builderHasTransactionType ? (
                  <Tooltip content="Select a Transaction Type first" placement="bottom">
                    <span>
                      <Button variant="outline" size="xs" disabled className="whitespace-nowrap">
                        Apply Rules
                      </Button>
                    </span>
                  </Tooltip>
                ) : (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => handleApplyRules()}
                    disabled={!canSubmitBuilder}
                    className="whitespace-nowrap"
                  >
                    Apply Rules
                  </Button>
                )
              )}
              {!isReadOnly && (
                !canCreateFromBuilder ? (
                  <Tooltip
                    content={
                      !builderHasTransactionType
                        ? 'Select a Transaction Type first'
                        : builderHasIncompleteRule
                          ? 'Finish filling (or remove) the unsaved rule set before saving.'
                          : builderHasIncompleteAttribute
                            ? 'Finish filling (or remove) the unsaved attribute before saving.'
                            : builderHasUnsavedRow
                              ? 'Save or discard the open condition/attribute editor before creating the rule.'
                              : 'Fix or remove the duplicate rule sets, conditions, or attributes flagged above before saving.'
                    }
                    placement="bottom"
                  >
                    <span>
                      <Button
                        data-tour="create-tag-button"
                        variant="primary"
                        size="xs"
                        disabled
                        className="whitespace-nowrap"
                      >
                        {editingDef ? `Save changes for "${editingDef.Tag}"` : 'Create Rule with current settings'}
                      </Button>
                    </span>
                  </Tooltip>
                ) : (
                  <Button
                    data-tour="create-tag-button"
                    variant="primary"
                    size="xs"
                    onClick={handleCreateFromBuilder}
                    className="whitespace-nowrap"
                  >
                    {editingDef ? `Save changes for "${editingDef.Tag}"` : 'Create Rule with current settings'}
                  </Button>
                )
              )}
            </div>
          </div>


          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
              builderCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
            }`}
            aria-hidden={builderCollapsed}
          >
          <div className="overflow-hidden min-h-0">
          <div className="p-5 flex flex-col md:flex-row  flex-1 gap-5">
            {/* Matching rules section */}
            <div className='w-full md:w-1/2'>
              <h4 className="text-xs font-semibold text-body-secondary uppercase tracking-wide mb-1">
                Matching Rules
              </h4>
              <StepRuleExpressions
                ruleGroups={builder.formState.ruleGroups}
                libraryId={ruleBuilderLibraryId ?? undefined}
                definitionId={editingDef?.Id}
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
                onCloneGroup={builder.cloneRuleGroup}
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
                onConditionEditingChange={handleRowEditingChange}
                startCollapsed={!!editingDef}
                readOnly={isReadOnly}
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
                libraryId={ruleBuilderLibraryId ?? undefined}
                definitionId={editingDef?.Id}
                onAdd={builder.addAttribute}
                onRemove={builder.removeAttribute}
                onClone={builder.cloneAttribute}
                onUpdate={builder.updateAttribute}
                onReorder={builder.reorderAttributes}
                transactions={filteredData.map((d) => d.row)}
                startCollapsed={!!editingDef}
                readOnly={isReadOnly}
                suggestedAttributeNames={suggestedAttributeNames}
                suggestedTagName={builder.formState.tag.trim() || undefined}
                tagSpecKind={
                  (editingParentLib ?? inProgressLib)?.StatusTag === 'INPROGRESS'
                    ? 'ops'
                    : 'active'
                }
                onAttributeEditingChange={handleRowEditingChange}
              />
            </div>
          </div>

          {/* Existing Matching Tags — live preview from GetAllTransactionTags.
              The current definition (from a tag click or an edit) is filtered
              out so the section only surfaces OTHER tags that match the same
              transactions — surfacing self would just echo what the user is
              already looking at. */}
          {builderOpen && matchingTagIds !== null && (() => {
            const currentDefinitionId = tagClickState?.definitionId ?? editingDef?.Id;
            const otherMatchingTagIds = currentDefinitionId
              ? matchingTagIds.filter((id) => id !== currentDefinitionId)
              : matchingTagIds;
            return (
              <div className="px-5 pb-3">
                <div className="flex items-baseline gap-2 mb-1.5">
                  <h4 className="text-xs font-semibold text-body-secondary uppercase tracking-wide">
                    Tags Matching The Specified Rule Sets
                  </h4>
                  {matchingTagsLoading && (
                    <span className="text-[10px] text-faint italic">Loading…</span>
                  )}
                </div>
                {otherMatchingTagIds.length === 0 ? (
                  <span className="text-[11px] text-faint italic">
                    No other existing tags match this rule yet.
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {otherMatchingTagIds.map((id) => {
                      const def = tagDefinitions.find((d) => d.Id === id);
                      if (!def) return null;
                      const source = definitionSourceMap.get(id) ?? 'Backend';
                      const isUserCreated = !originalDefinitionIds?.has(id);
                      const versionInfo = definitionVersions.get(id);
                      return (
                        <Tooltip
                          key={id}
                          content={renderTagTooltip(source, def, true, versionInfo)}
                          placement="top"
                        >
                          <span>
                            <TagBadge
                              tag={def.Tag}
                              certainty={def.CertaintyLevelTag ?? 'HIGH'}
                              isUserCreated={isUserCreated}
                              version={versionInfo?.version}
                              onClick={() => setPreviewDef(def)}
                            />
                          </span>
                        </Tooltip>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          <span className='flex flex-col items-center w-full text-slate-500 text-xs pb-2 gap-1'>
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

            {/* Before Apply Rules: surface only the DELTA between the rows
                tagged with this name (across the bank/side, respecting user
                filters) and the rows visible in the table (scoped to this
                definition). The delta represents rows tagged via another
                definition that happens to share the same name — opening the
                modal lets the operator inspect those without mutating the
                table they're editing. */}
            {(() => {
              if (!tagClickState) return null;
              if (tagClickState.showingAll || tagClickState.rulesetApplied) return null;
              if (tagClickState.tagNameCount === null) return null;
              const rawTotal = totalTransactionsCount ?? 0;
              const delta = tagClickState.tagNameCount - rawTotal;
              if (delta <= 0) return null;
              return (
                <button
                  className='text-[11px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer'
                  onClick={() => setOtherDefsModalOpen(true)}
                >
                  {delta.toLocaleString()} other transaction{delta !== 1 ? 's' : ''} share this tag — click to view
                </button>
              );
            })()}
          </span>

          {!isReadOnly && editingDef && (
            <div className="px-5 pb-3 flex justify-end">
              <Button
                variant="danger_ghost"
                size="xs"
                onClick={handleRequestDelete}
                className="whitespace-nowrap dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/40 dark:hover:bg-red-500/20 dark:hover:border-red-500/60"
                title="Delete this tag rule"
              >
                Delete
              </Button>
            </div>
          )}
          </div>
          </div>
        </div>
        );
        return ruleBuilderLibraryId ? (
          <CommentsProvider
            libraryId={ruleBuilderLibraryId}
            authToken={ruleBuilderAuthToken}
            tepHeaders={ruleBuilderTepHeaders}
            eager
          >
            {builderPanel}
          </CommentsProvider>
        ) : (
          builderPanel
        );
      })()}

      {hiddenDefIds.size > 0 && (
        <div className="flex items-center px-4 py-2 border-y border-border bg-surface-secondary">
          <button
            type="button"
            onClick={() => setHiddenTagsPanelOpen(true)}
            disabled={hideBusy}
            className="cursor-pointer inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded border border-border-strong bg-surface text-body hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hideBusy ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908A3 3 0 1115 12m-2 4a9 9 0 01-12-7l2.292-2.292M3 3l18 18" />
              </svg>
            )}
            <span>Hidden Tag Specs</span>
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-white text-[10px] font-semibold">
              {hiddenDefIds.size}
            </span>
          </button>
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
        definitionVersions={definitionVersions}
        highlightExpressions={highlightExpressions}
        searchHighlights={searchHighlights}
        onTagClick={handleTagClick}
        onFlagDeadEnd={!isReadOnly && !tagClickState?.showingAll && !tagClickState?.rulesetApplied ? flagDeadEnd : undefined}
        onFlagDeadEndWithComment={!isReadOnly && !tagClickState?.showingAll && !tagClickState?.rulesetApplied ? flagDeadEndWithComment : undefined}
        onSetComments={!isReadOnly && !tagClickState?.showingAll && !tagClickState?.rulesetApplied ? setComments : undefined}
        onHideTagDefs={!isReadOnly && !tagClickState?.showingAll && !tagClickState?.rulesetApplied ? hideTagDefs : undefined}
        showAttributes={showAttributes}
        relaxedMode={relaxedMode}
        hiddenColumns={tableHiddenColumns}
        columnOrder={columnOrder}
        onColumnsReady={setTableColumns}
        onVisibleColumnsReady={setVisibleTableColumns}
        builderHeight={builderHeight}
        loading={loading}
        accentHue={190}
//   190 — cyan (default)
// 220 — blue
// 260 — purple
// 340 — pink
// 30 — orange
// 140 — green
        onRowContextMenu={(row, x, y) => setContextMenu({ row, x, y })}
        onCellDoubleClick={
          builderOpen && !isReadOnly
            ? (field, value) => {
                // Operator-requested shortcut: while the Rule Builder is
                // open, double-clicking a TransactionTypeCode cell copies
                // that value into the builder's Transaction Type dropdown.
                if (field !== 'TransactionTypeCode') return;
                const next = value == null ? '' : String(value).trim();
                if (!next) return;
                if (builder.formState.transactionTypeCode === next) return;
                builder.updateBasicInfo({ transactionTypeCode: next });
              }
            : undefined
        }
        interactiveCellFields={
          builderOpen && !isReadOnly ? TRANSACTION_TYPE_INTERACTIVE_FIELDS : undefined
        }
        interactiveCellHint="Double-click to use as the rule's Transaction Type"
        originalEditingDef={editingDef}
        activeDefinitionId={tagClickDefinitionId ?? editingDef?.Id}
      />
      )}

      {/* Hide the pagination strip entirely when the table is empty and we
          aren't waiting on a fetch — "0 loaded · N total" plus +N buttons next
          to a "No transactions found" empty state is just noise. Otherwise
          render the strip even for single-page result sets so the user always
          sees the "X loaded · Y total" count. */}
      {!(filteredLen === 0 && !loading) && (() => {
        // Compute backward and forward batch lists once so the skeleton placeholders
        // mirror the actual button layout (e.g. don't draw four backward boxes when
        // only one backward button would render). loaded / total / hidden are
        // shared with the header label via displayCounts so both surfaces are
        // self-consistent (loadedNow <= totalNow always).
        const { loadedRaw, loadedNow, totalNow } = displayCounts;
        // Removable in visible scope — the -N buttons are sized to the
        // operator's perceived count, not the raw buffer. The actual trim
        // call scales by the observed visible/raw ratio below.
        const removable = Math.max(0, loadedNow - BATCH_SIZE);
        const backBatches = (() => {
          const b = [500, 200, 50, 25].filter((x) => x <= removable);
          if (b.length === 0 && removable > 0) b.unshift(removable);
          return b;
        })();
        // "Remaining" drives the forward +N batch buttons. Use visible
        // scope (totalNow / loadedNow) so the offered increments match
        // what the operator can actually surface — asking for +25 when
        // only 13 more visible rows exist would either undershoot the
        // request or burn overfetch attempts hitting the cap. The
        // overfetch loop still consumes raw rows under the hood.
        const remaining = Math.max(0, totalNow - loadedNow);
        const fwdBatches = (() => {
          const b = [25, 50, 200, 500].filter((x) => x <= remaining);
          if (b.length === 0 && remaining > 0) b.push(remaining);
          return b;
        })();
        return (
        <div className="flex items-center justify-center gap-3 py-2 mt-1 border border-border bg-surface-secondary rounded-lg">
          {loading ? (
            <div className="flex items-center gap-3 animate-pulse">
              {backBatches.map((_, i) => (
                <div key={`back-skel-${i}`} className="h-5 w-10 rounded bg-gray-200 dark:bg-gray-700" />
              ))}
              {backBatches.length > 0 && <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />}
              <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-700" />
              {fwdBatches.length > 0 && <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />}
              {fwdBatches.map((_, i) => (
                <div key={`fwd-skel-${i}`} className="h-5 w-10 rounded bg-gray-200 dark:bg-gray-700" />
              ))}
            </div>
          ) : incrementalPagination ? (
            <>
              {backBatches.length > 0 && (
                <>
                  {backBatches.map((size) => (
                    <Button key={`back-${size}`} variant="outline" size="xs" onClick={() => {
                      if (!isLiveMode) {
                        setVisibleCount((c) => Math.max(BATCH_SIZE, c - size));
                        return;
                      }
                      if (hiddenDefIds.size === 0 || loadedNow === 0) {
                        trimLoadedTransactions(size);
                        return;
                      }
                      // Scale the raw trim by the observed visible ratio so
                      // the operator's "-N" reduces visible rows by N (not
                      // raw rows by N, which would barely move the visible
                      // count when most rows are hidden).
                      const visibleRatio = Math.max(0.05, loadedNow / loadedRaw);
                      const rawTrim = Math.min(loadedRaw, Math.ceil(size / visibleRatio));
                      trimLoadedTransactions(rawTrim);
                    }}>
                      &minus;{size.toLocaleString()}
                    </Button>
                  ))}
                  <span className="text-border">|</span>
                </>
              )}
              <span className="text-xs text-muted">
                <span className="font-medium text-heading">{loadedNow.toLocaleString()}</span>
                {' loaded · '}
                <span className="font-medium text-heading">{totalNow.toLocaleString()}</span>
                {' total'}
              </span>
              {hasMore && fwdBatches.length > 0 && (
                <>
                  <span className="text-border">|</span>
                  {fwdBatches.map((size) => (
                    <Button key={size} variant="outline" size="xs" onClick={() => loadNVisible(size)}>
                      +{size.toLocaleString()}
                    </Button>
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              <Button variant="ghost" size="xs" disabled={currentPage === 0} onClick={() => {
                const newPage = currentPage - 1;
                setCurrentPage(newPage);
                setPageInputValue(String(newPage + 1));
                if (isLiveMode) fetchPage(outgoingFilters, false, newPage, undefined, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
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
                      if (isLiveMode) fetchPage(outgoingFilters, false, num - 1, undefined, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
                    }
                    setPageInputValue(String(currentPage + 1));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const num = parseInt(pageInputValue, 10);
                      if (!isNaN(num) && num >= 1 && num <= classicTotalPages) {
                        setCurrentPage(num - 1);
                        setPageInputValue(String(num));
                        if (isLiveMode) fetchPage(outgoingFilters, false, num - 1, undefined, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
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
                if (isLiveMode) fetchPage(outgoingFilters, false, newPage, undefined, activeExtraFilters.length > 0 ? activeExtraFilters : undefined);
              }}>
                Next &rarr;
              </Button>
              <span className="text-border">|</span>
              <span className="text-xs text-muted">
                <span className="font-medium text-heading">{loadedNow.toLocaleString()}</span>
                {' loaded · '}
                <span className="font-medium text-heading">{totalNow.toLocaleString()}</span>
                {' total'}
              </span>
            </>
          )}
        </div>
        );
      })()}

      {wizardOpen && (
        <TagWizardModal
          existingDef={editingDef}
          // In edit mode `editingParentLib` is set; in create mode it's
          // undefined and we'd otherwise pass `parentLib={undefined}` to the
          // wizard, which makes `commentsLibraryId` null and short-circuits
          // `buildCommentTargetByFormKey` to an empty map — drafts then can't
          // resolve their targets and every flush is skipped. Fall back to the
          // in-progress library matching the active checkout so create-mode
          // comment drafts have a real library scope at save time.
          parentLib={editingParentLib ?? inProgressLib ?? undefined}
          initialFormState={wizardInitialState}
          initialStep={wizardInitialStep}
          fromCheckoutContext={wizardFromCheckout}
          onSave={handleWizardSave}
          onClose={handleWizardClose}
          saving={savingTagSpec}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Tag Rule"
        message={`Are you sure you want to delete the tag "${deleteTarget?.tag}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger_ghost"
      />

      {activeCheckout && shareDialogOpenProp && (
        <ShareLinkDialog
          open={shareDialogOpenProp}
          onClose={onShareDialogClose ?? (() => {})}
          bank={activeCheckout.bank}
          side={activeCheckout.side}
          filters={filters}
          toggles={{ compactMode: relaxedMode, incrementalPagination, showAttributes }}
          sharedBy={operatorName ?? 'Unknown'}
        />
      )}

      {contextMenu && (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onViewContext={() => { setContextModalRow(contextMenu.row); setContextMenu(null); }}
          onComment={!isAudit ? () => { setSingleRowCommentRow(contextMenu.row); setContextMenu(null); } : undefined}
          onClose={() => setContextMenu(null)}
        />
      )}

      <CommentDialog
        open={!!singleRowCommentRow}
        mode="comment-only"
        selectedRows={singleRowCommentRow ? [singleRowCommentRow] : []}
        onClose={() => setSingleRowCommentRow(null)}
        onConfirm={async (result: CommentDialogResult) => {
          if (result.skipped) return;
          if (result.entries.length > 0) await setComments(result.entries);
        }}
      />


      <TagDetailPanel
        open={!!previewDef}
        definition={previewDef}
        source={previewDef ? definitionSourceMap.get(previewDef.Id) ?? 'Backend' : 'Backend'}
        isUserCreated={previewDef ? !originalDefinitionIds?.has(previewDef.Id) : false}
        onClose={() => setPreviewDef(null)}
      />

      <LovBrowserDrawer
        open={lovBrowserOpen}
        onClose={() => setLovBrowserOpen(false)}
      />

      <HiddenTagsPanel
        open={hiddenTagsPanelOpen}
        onClose={() => setHiddenTagsPanelOpen(false)}
        items={hiddenTagItems}
        hiddenCount={hiddenDefIds.size}
        originalDefinitionIds={originalDefinitionIds}
        definitionSourceMap={definitionSourceMap}
        definitionVersions={definitionVersions}
        onUnhide={unhideTagDef}
        onUnhideAll={unhideAllTags}
        busy={hideBusy}
      />

      {contextModalRow && (() => {
        const authHeaders = getAuthHeaders();
        const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
        const tepHeaders: TepHeaders = {
          apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
          userId: userId ?? '',
          tenantCode: tepConfig.ttpTenantCode,
          languageCode: tepConfig.languageCode,
          timeZone: tepConfig.timeZone,
          requestId: tepConfig.ttpRequestId,
        };
        return (
          <ViewContextModal
            open
            onClose={() => setContextModalRow(null)}
            transaction={contextModalRow}
            authToken={token}
            tepHeaders={tepHeaders}
            visibleColumns={visibleTableColumns}
            libraries={effectiveLibraries}
          />
        );
      })()}

      {otherDefsModalOpen && tagClickState
        && !tagClickState.showingAll && !tagClickState.rulesetApplied
        && (() => {
        const authHeaders = getAuthHeaders();
        const token = authHeaders.Authorization?.replace('Bearer ', '') ?? '';
        const tepHeaders: TepHeaders = {
          apiKey: import.meta.env.VITE_TEP_API_KEY ?? '',
          userId: userId ?? '',
          tenantCode: tepConfig.ttpTenantCode,
          languageCode: tepConfig.languageCode,
          timeZone: tepConfig.timeZone,
          requestId: tepConfig.ttpRequestId,
        };
        return (
          <OtherDefinitionsTransactionsModal
            open
            onClose={() => setOtherDefsModalOpen(false)}
            tagName={tagClickState.tagName}
            currentDefinitionId={tagClickState.definitionId}
            filters={filters}
            authToken={token}
            tepHeaders={tepHeaders}
            visibleColumns={visibleTableColumns}
            libraries={effectiveLibraries}
          />
        );
      })()}

      {isLiveMode && inProgressLib?.Id && (
        <CommentSearchPanel
          open={searchPanelOpen}
          target={{
            TagSpecLibraryId: inProgressLib.Id,
            TagSpecDefinitionId: null,
            TagRuleExpressionId: null,
            AttributeTag: null,
          } satisfies TagSpecCommentTarget}
          onClose={() => setSearchPanelOpen(false)}
        />
      )}
      {/* Full-screen busy overlay for hide / unhide tag spec operations.
          Unhiding many tag specs at once forces a heavy re-render
          (every previously-hidden row comes back, gets re-analyzed,
          re-laid out) that visibly freezes the browser. The overlay
          gives the operator a clear "working…" signal so they don't
          assume the app crashed. It paints before the heavy re-render
          starts (busy is set true, the work is deferred via setTimeout)
          and stays up through the commit (the clear is also deferred
          into a separate task so the overlay outlives the reflow). */}
      {hideBusy && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Updating hidden tag specs"
          className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] pointer-events-auto"
        >
          <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-elevated border border-border shadow-lg px-6 py-5">
            <svg className="w-8 h-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm font-medium text-body">Updating tag spec visibility…</p>
            <p className="text-xs text-muted">This can take a moment when restoring many tag specs.</p>
          </div>
        </div>
      )}
    </div>
    </WizardCommentDraftsProvider>
  );
}
