import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useAuth } from '../../context/AuthContext';
import { useTransactionData } from '../../hooks/useTransactionData';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useMatchingTagIds } from '../../hooks/useMatchingTagIds';
import { buildRulesetFilters, buildRegexFilterFromRuleGroups } from '../../utils/buildRulesetFilters';
import { MatchingRulesFilterButton } from './MatchingRulesFilterButton';
import {
  hasDuplicateGroups,
  hasEmptyRuleGroup,
  hasIncompleteCondition,
  hasWithinGroupConditionDuplicates,
  isFilledCondition,
} from '../../utils/ruleFingerprint';
import {
  hasDuplicateAttributeNames,
  hasIncompleteAttribute,
} from '../../utils/attributeFingerprint';
import type { FilterProperty } from '../../api/transactions';
import { getAllTransactionTags, buildSortingProperties, parseSortOverride, type SortOverride } from '../../api/transactions';
import { dataSetTypeFilter, dataSetTypeScopeValues, DEFAULT_DATA_SET_TYPE, isSameDataSetFamily } from '../../constants/dataSetTypes';
import { libraryMatchesCheckout, identityKeySuffix, identityScopeFilters, isLedger } from '../../utils/libraryIdentity';
import { translateFilters } from '../../utils/translateFilters';
import { findTransactionTypeFilterDef } from '../../utils/transactionTypeFilterDef';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { useOptionalDownloadCenter } from '../../context/DownloadCenterContext';
import { useWizardForm, fromExistingDefinition } from '../../hooks/useWizardForm';
import type { TagSpecDefinition, TagSpecLibrary, AnalyzedTransaction, WizardFormState, RuleExpression, CheckoutState, TransactionRow, AndGroupFormValue } from '../../types';
import type { WizardFormResult } from '../../hooks/useWizardForm';
import { analyzeRow, buildAnalyzeScratch } from '../../utils/analyzeRow';
import { matchingMt940Defs } from '../../utils/mt940Suggestions';
import { evaluateRuleSet } from '../../utils/evaluateRuleSet';
import { computeDefinitionVersions } from '../../utils/definitionVersions';
import { getAllTagNameOptions, getAttributeSuggestionsForTag } from '../../utils/tagNameLookup';
import { SearchableSelect } from '../shared/SearchableSelect';
import { regexify, regexifyExtraction, generateExpressionPrompt, generateExtractionPrompt } from '../../utils/regexify';
import { generateExpressionId } from '../../utils/uuid';
import { getContextValue } from '../../types/tagSpec';
import { TransactionTable, ColumnPicker, PREVIEW_TEMP_DEF_ID, renderTagTooltip, type ColumnDef } from './TransactionTable';
import { getColumnSpec } from '../../constants/transactionColumns';
import { loadColumnPrefs, saveHiddenColumns, saveColumnOrder, saveColumnWidths, type ColumnPrefs } from '../../utils/columnPrefs';
import { settingsStore } from '../../utils/settingsStore';
import { TagBadge } from './TagBadge';
import { StepRuleExpressions } from '../wizard/StepRuleExpressions';
import { StepAttributes } from '../wizard/StepAttributes';
import { TagWizardModal } from '../wizard/TagWizardModal';
import { ValidityEditor } from '../wizard/ValidityEditor';
import { DuplicateRulesButton } from '../wizard/DuplicateRulesButton';
import { LovBrowserDrawer } from '../lovs/LovBrowserDrawer';
import { Button } from '../shared/Button';
import { CopyableId } from '../shared/CopyableId';
import { Toast } from '../shared/Toast';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Tooltip } from '../shared/Tooltip';
import { DynamicFilters } from './DynamicFilters';
import { Toggle } from '../shared/Toggle';
import { DropdownBackdrop } from '../shared/DropdownBackdrop';
import { useLocalChanges } from '../../hooks/useLocalChanges';
import { useVisibleRowsEngine } from '../../hooks/useVisibleRowsEngine';
import { clampPageIndex } from '../../utils/visibleRows';
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
  /** Bubbles up the rule-builder open/close state so the parent header
   *  can disable Release / Check-in while the operator is mid-authoring.
   *  Without this signal the parent has no view into builder state — it
   *  lives entirely inside this tab. */
  onBuilderOpenChange?: (open: boolean) => void;
}

function formStateToTempDefinition(formState: WizardFormState): TagSpecDefinition | null {
  const hasCondition = formState.ruleGroups.some((g) =>
    g.conditions.some(isFilledCondition)
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
        .filter(isFilledCondition)
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
            PreExtractionTransformations: null,
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
          // Pre-extraction pipeline mirrors what `toTagSpecDefinition`
          // emits at save time, so the live preview the operator sees
          // while authoring matches the extraction the saved rule will
          // compute. Without this branch the table's SADAD column (and
          // every other attribute) showed empty / mis-extracted values
          // even though the in-builder Extraction Preview correctly
          // applied the pre-pipeline — the table runtime took a
          // different path that read attr.PreExtractionTransformations
          // and got `undefined`.
          ...((attr.preExtractionTransformations && attr.preExtractionTransformations.length > 0)
            ? {
                PreExtractionTransformations: attr.preExtractionTransformations.map((t) => ({
                  Method: t.method,
                  Args: Object.entries(t.args).map(([k, v]) => ({ Key: k, Value: v })),
                })),
              }
            : {}),
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
// Stable empty set for the disabled "Character view" state (a fresh new Set()
// each render would bust TransactionTable's rowCtx memo).
const EMPTY_CHAR_VIEW_COLS: ReadonlySet<string> = new Set<string>();
// Narrative columns eligible for the character-view breakdown. Statement
// names first, then the Ledger model V2 narrative fields (only columns the
// active workspace actually renders take effect — the rest are inert).
const CHAR_VIEW_COLUMNS: { field: string; label: string }[] = [
  { field: 'AdditionalInformation', label: 'Additional Information' },
  { field: 'Description1', label: 'Description 1' },
  { field: 'Description2', label: 'Description 2' },
  { field: 'TransactionDetails', label: 'Transaction Details' },
  { field: 'Narrative', label: 'Narrative' },
  { field: 'TransactionNarrative', label: 'Transaction Narrative' },
  { field: 'TransactionRef', label: 'Transaction Ref' },
  { field: 'SourceRef', label: 'Source Ref' },
  { field: 'Notes', label: 'Notes' },
];
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


export function TransactionsTab({ activeCheckout, onClearPendingDefinition, initialShareFilters, initialShareToggles, operatorName, shareDialogOpen: shareDialogOpenProp, onShareDialogClose, pendingPillFilters, onPendingPillFiltersConsumed, onBuilderOpenChange }: TransactionsTabProps) {
  const { libraries, tagDefinitions, originalDefinitionIds, dispatch, isPairBeingTagged, rawHierarchyNodes } = useTagSpecs();
  const { userId, usersMap, getAuthHeaders, refreshIfNeeded, isAudit } = useAuth();
  const { extractionMethods } = useLovAttributes();
  const tepConfig = useTepConfig();
  const { saveBaseline, updateCurrent } = useLocalChanges(activeCheckout);

  // Determine if the current user is NOT the checkout owner (read-only mode)
  const { isReadOnly, ownerName } = useMemo(() => {
    if (isAudit) return { isReadOnly: true, ownerName: null };
    if (!activeCheckout) return { isReadOnly: true, ownerName: null };
    const inProgressLib = libraries.find(
      (l) => l.StatusTag === 'INPROGRESS' && libraryMatchesCheckout(l, activeCheckout)
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
      (l) => l.StatusTag === 'INPROGRESS' && libraryMatchesCheckout(l, activeCheckout)
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
      const baselineKey = `tep:baseline:${identityKeySuffix(activeCheckout)}`;
      if (!settingsStore.getItem(baselineKey)) {
        saveBaseline(inProgressLib);
      } else {
        updateCurrent(inProgressLib);
      }
    }
  }, [inProgressLib, activeCheckout, saveBaseline, updateCurrent]);

  const {
    transactions, fieldMeta, loadTransactions, resetToSample, isCustomData, flagDeadEnd,
    setComments, flagDeadEndWithComment,
    isLiveMode, loading, totalTransactionsCount, replaceFromBeginning, replaceFromBeginningExcluding, fetchCount,
    filterDefinitions, filterDefinitionsLoading, fetchFilterDefinitions,
    decimalMaxValues, setAnchorColumn,
  } = useTransactionData();
  // Fetch filter definitions when the Transactions tab mounts, scoped to the
  // checked-out DataSetType so the filter catalog matches the workspace.
  // Re-fetches when the workspace changes.
  useEffect(() => {
    if (isLiveMode) {
      fetchFilterDefinitions(activeCheckout?.dataSetType ?? DEFAULT_DATA_SET_TYPE);
    }
  }, [isLiveMode, fetchFilterDefinitions, activeCheckout?.dataSetType]);
  // DECIMAL filter sliders use a static 200M default ceiling instead of a
  // probe-API call (see DEFAULT_DECIMAL_MAX in DynamicFilters). Edit mode lets
  // the user type a higher value if their workload needs it, so we don't pay
  // the cost of an unscoped probe round-trip on every navigation here.

  // The transaction buffer lives in TransactionDataContext and survives tab
  // navigation, so right after a workspace switch it still holds the PREVIOUS
  // workspace's rows until the new scope's first fetch lands — MT940 rows
  // would flash inside a Ledger view (wrong columns, wrong data) and vice
  // versa. Rows carry their scope (DataSetType + identity fields), so detect
  // the mismatch directly off the buffer and hold the table in its skeleton
  // state until the buffer belongs to the current checkout.
  const staleScopeBuffer = useMemo(() => {
    if (!isLiveMode || transactions.length === 0) return false;
    const row = transactions[0] as Record<string, unknown>;
    const rowDst = String(row['DataSetType'] ?? '');
    // Rows without a DataSetType can't be classified — never hold the
    // skeleton on a guess.
    if (!rowDst) return false;
    const dst = activeCheckout?.dataSetType ?? DEFAULT_DATA_SET_TYPE;
    // FAMILY comparison, not equality: prod serves TransactionsList-labeled
    // rows under the MT940 scope filter — an exact check held the skeleton
    // forever because the buffer never "matched" the workspace.
    if (!isSameDataSetFamily(rowDst, dst)) return true;
    if (!activeCheckout) return false;
    if (isLedger(dst)) {
      const client = String(row['ClientCode'] ?? '');
      const erp = String(row['ErpCode'] ?? '');
      return Boolean(
        (activeCheckout.clientCode && client && client !== activeCheckout.clientCode) ||
        (activeCheckout.erpCode && erp && erp !== activeCheckout.erpCode),
      );
    }
    const bank = String(row['BankSwiftCode'] ?? '');
    const side = String(row['Side'] ?? '');
    return Boolean(
      (activeCheckout.bank && bank && bank !== activeCheckout.bank) ||
      (activeCheckout.side && side && side !== activeCheckout.side),
    );
  }, [isLiveMode, transactions, activeCheckout]);

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
  // Set true when the builder is opened by cloning an MT940 suggestion onto an
  // intraday row: that flow must leave the Transaction Type EMPTY (MT940 TTCs
  // don't apply to MT942 / INTERIM_MT940), so the on-open effect below skips
  // its single-value-chip TTC seed for that one open. Consumed + reset there.
  const cloneMt940SkipTtcRef = useRef(false);
  // Bubble builder open/close to the parent so the page header can disable
  // Release / Check-in while a rule is being authored — committing those
  // actions mid-authoring would drop the in-progress definition without
  // a save path. The parent owns the actual disabling on the header
  // buttons; this hook just forwards the signal.
  useEffect(() => {
    onBuilderOpenChange?.(builderOpen);
  }, [builderOpen, onBuilderOpenChange]);
  // When collapsed the builder shows only its header bar (title, type/tag
  // picker, action buttons) so the operator can hand the rest of the screen
  // over to the transactions table without closing the builder entirely.
  const [builderCollapsed, setBuilderCollapsed] = useState(false);
  const [lovBrowserOpen, setLovBrowserOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const builderRef = useRef<HTMLDivElement>(null);
  const [builderHeight, setBuilderHeight] = useState(0);
  // Natural (unclamped) height of the collapsible builder body. Drives the
  // expand max-height so it fits the real content instead of a fixed cap — a
  // hard 2000px cap clipped the footer (Collapse button) once several
  // uncollapsed attributes/rules pushed the body taller. `null` until measured.
  const builderBodyRef = useRef<HTMLDivElement>(null);
  const [builderBodyHeight, setBuilderBodyHeight] = useState<number | null>(null);
  const [showOnlyUntagged, setShowOnlyUntagged] = useState(false);
  const [showOnlyMultiTagged, setShowOnlyMultiTagged] = useState(false);
  const [showOnlyDeadEnd, setShowOnlyDeadEnd] = useState(false);
  const [showAttributes, setShowAttributes] = useState(() => {
    try { return settingsStore.getItem('tep:showAttributes') === 'true'; } catch { return false; }
  });
  const [incrementalPagination, setIncrementalPagination] = useState(() => {
    try { const v = settingsStore.getItem('tep:incrementalPagination'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  const [currentPage, setCurrentPage] = useState(0);
  const [pageInputValue, setPageInputValue] = useState('1');
  const [relaxedMode, setRelaxedMode] = useState(() => {
    try { const v = settingsStore.getItem('tep:relaxedMode'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  // Ledger "Show full transactions": widen every matched leg to its whole
  // journal entry (the GetTEPTransactionsAnchorBased read). Default ON — it
  // matches how operators read a journal. Persisted per device; only affects
  // the Ledger workspace.
  const [showFullTransactions, setShowFullTransactions] = useState(() => {
    try { const v = settingsStore.getItem('tep:ledgerFullDocs'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  // "Character view": render RTL narrative cells as a logical-order character
  // breakdown so splitting positions are unambiguous. Off by default; the set
  // of target columns defaults to Additional Information and the operator can
  // add other narrative columns. Both persist per device.
  const [charViewEnabled, setCharViewEnabled] = useState(() => {
    try { return settingsStore.getItem('tep:charView') === 'true'; } catch { return false; }
  });
  const [charViewCols, setCharViewCols] = useState<Set<string>>(() => {
    try {
      const stored = settingsStore.getItem('tep:charViewCols');
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set(['AdditionalInformation']);
    } catch { return new Set(['AdditionalInformation']); }
  });
  const [charViewMenuOpen, setCharViewMenuOpen] = useState(false);
  // Column layout (hidden set / order / widths) is stored PER DataSetType
  // (column spec Rule 3): switching workspaces loads that type's saved
  // layout, and changing one workspace's layout never affects another's.
  // loadColumnPrefs also migrates the pre-Ledger global keys into the MT940
  // slot on first run.
  const columnPrefsDst = activeCheckout?.dataSetType ?? DEFAULT_DATA_SET_TYPE;
  const initialColumnPrefsRef = useRef<(ColumnPrefs & { sort: SortOverride | null }) | null>(null);
  if (initialColumnPrefsRef.current === null) {
    let sort: SortOverride | null = null;
    try {
      const stored = settingsStore.getItem('tep:sortOverride');
      sort = stored ? parseSortOverride(JSON.parse(stored), columnPrefsDst) : null;
    } catch { sort = null; }
    initialColumnPrefsRef.current = { ...loadColumnPrefs(columnPrefsDst), sort };
  }
  // The DataSetType the CURRENT column state belongs to. Save effects write
  // under this key (not columnPrefsDst) so a mid-switch render can never leak
  // one workspace's layout into another's storage slot.
  const columnPrefsLoadedDstRef = useRef<string>(columnPrefsDst);
  // The layout values the current state was HYDRATED from (mount load or a
  // workspace-switch reload), updated after every save. The save effects
  // compare by IDENTITY and skip when the state still IS this value, so a
  // save only ever happens for a GENUINE user change. Without this the
  // mount/switch commits echoed whatever the load returned back into
  // storage — and a load that failed or came back empty (throwing/blocked
  // localStorage read, corrupt entry) became a DESTRUCTIVE write that
  // removed the stored layout ("column layouts randomly reset").
  const hydratedPrefsRef = useRef<{
    hidden: Set<string> | null;
    order: string[];
    widths: Record<string, number>;
    sort: SortOverride | null;
  }>({
    hidden: initialColumnPrefsRef.current!.hidden,
    order: initialColumnPrefsRef.current!.order,
    widths: initialColumnPrefsRef.current!.widths,
    sort: initialColumnPrefsRef.current!.sort,
  });
  const [hiddenColumns, setHiddenColumns] = useState<Set<string> | null>(
    () => initialColumnPrefsRef.current!.hidden
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(
    () => initialColumnPrefsRef.current!.order
  );
  // Per-user alphabetical sort override on a single column. `null` means
  // fall back to the DataSetType's default sorting (statement: StatementDate
  // ASC + Sequence ASC; Ledger: PostingDate ASC + Sequence ASC).
  // parseSortOverride validates against the active type's sortable columns so
  // a stale localStorage entry from a renamed column (or another workspace's
  // column) silently reverts to default instead of sending an invalid sort
  // key to the backend.
  const [sortOverride, setSortOverride] = useState<SortOverride | null>(
    () => initialColumnPrefsRef.current!.sort,
  );
  // Per-column width overrides, in pixels. Lets the operator drag the
  // Additional Information (and any other narrative) column wider when
  // the default + line-clamp is too tight to read. Keyed by column key
  // (e.g. "data:AdditionalInformation"); absent keys fall back to the
  // column's natural / default width.
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => initialColumnPrefsRef.current!.widths
  );
  // Workspace switch while mounted (e.g. a share-link restore or a checkout
  // change without a tab round-trip): reload that DataSetType's saved layout.
  useEffect(() => {
    if (columnPrefsLoadedDstRef.current === columnPrefsDst) return;
    const prefs = loadColumnPrefs(columnPrefsDst);
    // Re-parse the stored sort against the NEW workspace's sortable columns
    // (a column the new type doesn't offer parses to null) instead of just
    // nulling the in-memory override — the stored value survives workspace
    // round-trips (sort MT940 by Description1, visit Ledger, come back:
    // the sort is still there).
    let sort: SortOverride | null = null;
    try {
      const stored = settingsStore.getItem('tep:sortOverride');
      sort = stored ? parseSortOverride(JSON.parse(stored), columnPrefsDst) : null;
    } catch { sort = null; }
    setHiddenColumns(prefs.hidden);
    setColumnOrder(prefs.order);
    setColumnWidths(prefs.widths);
    setSortOverride(sort);
    // Mark the freshly loaded values as hydrated BEFORE the save effects see
    // them — a reload must never write back into storage.
    hydratedPrefsRef.current = { hidden: prefs.hidden, order: prefs.order, widths: prefs.widths, sort };
    columnPrefsLoadedDstRef.current = columnPrefsDst;
  }, [columnPrefsDst]);
  // Memoize the effective sort property array so passing it into useEffect
  // / useCallback dependency lists is stable as long as the override hasn't
  // changed. Falls back to the DataSetType's default sorting when no
  // override is active.
  const effectiveSorting = useMemo(
    () => buildSortingProperties(sortOverride, columnPrefsDst),
    [sortOverride, columnPrefsDst],
  );
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
    // Scoped to the checkout identity (bank/side, or client/erp for Ledger).
    const currKey = activeCheckout ? identityKeySuffix(activeCheckout) : null;
    if (!currKey) return new Set();
    try {
      const raw = sessionStorage.getItem(HIDDEN_DEF_IDS_STORAGE_KEY);
      if (!raw) return new Set();
      const stored = JSON.parse(raw) as { key?: string; ids?: string[] } | null;
      if (stored && stored.key === currKey && Array.isArray(stored.ids)) {
        return new Set(stored.ids);
      }
    } catch { /* fall through to empty */ }
    return new Set();
  });
  const [hiddenTagsPanelOpen, setHiddenTagsPanelOpen] = useState(false);
  const [hideBusy, setHideBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ row: TransactionRow; x: number; y: number; field?: string } | null>(null);
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

  // Operator-authored matching-rules filter. Same construction surface as the
  // Rule Builder (RuleGroupEditor + ConditionEditor under the hood), but
  // applied as a server-side REGEX FilterProperty so the table reflects the
  // rules without saving them as a real TagSpec. Empty array = filter off.
  // Survives builder open/close because it's its own filter surface.
  const [matchingRulesFilter, setMatchingRulesFilter] = useState<AndGroupFormValue[]>([]);

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
    // Hidden tag specs are intentionally NOT pushed as a server-side `NI`
    // filter anymore. The previous behavior wrapped the hide set in a
    // `NI` predicate against `OpsTagSpecDefinitionId|OpsMultiTags.
    // TagSpecDefinitionId` to save round trips on the +N overfetch
    // loop — but SQL `NOT IN (X)` returns NULL/false for NULL column
    // values, which silently dropped every UNTAGGED row from the
    // response (their tag-spec id is NULL). Operators with "Show:
    // Untagged" active would see their visible count collapse from
    // e.g. 22k to 6k the instant they hid a tag spec. The
    // client-side `filteredData` hide pass at line ~1737 is the
    // truth — it ignores untagged rows correctly and only drops rows
    // whose matched defs are in the hide set. The +N overfetch loop
    // already accounts for the loaded-but-hidden case via
    // `hiddenLoadedCount`, so giving up the NI optimization is the
    // smaller trade-off here.
    const withHidden = (filters: FilterProperty[]): FilterProperty[] => filters;

    // DataSetType scope — the checked-out library's type (MT940 / MT942 /
    // INTERIM_MT940), or MT940 when browsing without a checkout. The grid
    // endpoint returns EVERY type unless filtered, so this IN filter is what
    // keeps the grid (and, via handleExport, the CSV) scoped to the workspace
    // and stops intraday rows leaking into an MT940 view. It leads every
    // returned filter list.
    // For Ledger, also pin the ClientCode/ErpCode identity (bank/side don't
    // exist on Ledger rows). DataSetType alone suffices today (one client/erp),
    // but sending the context keeps the grid correct when a second ERP arrives.
    const scopePrefix: FilterProperty[] = [
      dataSetTypeFilter(activeCheckout?.dataSetType ?? DEFAULT_DATA_SET_TYPE),
      ...(activeCheckout && isLedger(activeCheckout.dataSetType)
        ? identityScopeFilters(activeCheckout, 'EQ')
        : []),
    ];

    if (tagClickDefinitionId != null) {
      // After "Apply Rules": use REGEX-based filters (Call 3)
      if (tagClickRulesetApplied) {
        return withHidden([...scopePrefix, ...(tagClickRulesetFilters ?? []), ...activePillFilters]);
      }
      // Default tag-click mode: scope by definition ID (Call 2)
      if (!tagClickShowingAll) {
        return withHidden([
          ...scopePrefix,
          {
            ColumnName: 'OpsTagSpecDefinitionId|OpsMultiTags.TagSpecDefinitionId',
            Value: tagClickDefinitionId,
            Operand: 'IN',
          },
          ...activePillFilters,
        ]);
      }
      // "Show all" mode: don't scope by TransactionTypeCode — the tag name filter
      // (applied via `filters`) is what the user wants to broaden to.
      return withHidden([...scopePrefix, ...activePillFilters]);
    }
    const extra: FilterProperty[] = [...scopePrefix];
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
    // Note: the rule builder's Transaction Type used to be forwarded as
    // an EQ FilterProperty here. That path is now handled by the
    // builder → chip mirror (see effect below), which writes the
    // selection into the named Transaction Types filter so the chip
    // visibly reflects the builder's choice. Forwarding it here too
    // would double-apply and conflict with operator-set multi-value
    // chip selections.
    // Builder Validity → backend StatementDate range filter goes through
    // the named-filter pipeline (see the useEffect that mirrors validity
    // into `filters[Tag_GTE/LTE]`). translateFilters then forwards the
    // entries to GetTEPTransactions with the authoritative column name
    // from the filter definition. No extra push needed here.
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
    // Operator-authored matching-rules filter (the "Matching Rules" chip in
    // the filter row). Compiles to a REGEX FilterProperty via the same
    // helper the Rule Builder uses, so the two surfaces produce identical
    // server payload shapes. When the builder ALSO has a REGEX in flight
    // we send both entries; the backend ANDs FilterProperty[] at the top
    // level, which is what the operator expects from stacking two filters.
    const manualRegex = buildRegexFilterFromRuleGroups(matchingRulesFilter);
    if (manualRegex) extra.push(manualRegex);
    return withHidden(extra);
    // NOTE: hiddenDefIds is intentionally NOT in the dep list — see the
    // comment at the top of this memo for why the server-side hidden
    // filter was removed. Hiding a tag spec is a pure client-side
    // re-filter via `filteredData`; nothing in this memo's body reads
    // hiddenDefIds anymore.
  }, [activeCheckout, tagClickDefinitionId, tagClickRulesetApplied, tagClickShowingAll, tagClickRulesetFilters, builderOpen, builder.formState, currentTagFilterIds, activePillFilters, matchingRulesFilter]);

  // Forward the UI filter state as-is. Earlier this hook stripped bank/side
  // when a TagSpecDefinitionId scope was active, on the theory that the
  // definition's parent library already implies them — but it actually
  // stripped the WHOLE filter set, which silently dropped the operator's
  // Bank Reference, IBAN, Search, etc. Detected Tag Specs are computed
  // against the active checkout's bank/side anyway, so the redundancy is
  // harmless; the simpler "send everything the user set" path is correct.
  const outgoingFilters = filters;

  // Persist settings to localStorage
  useEffect(() => { try { settingsStore.setItem('tep:showAttributes', String(showAttributes)); } catch { /* ignore */ } }, [showAttributes]);
  useEffect(() => { try { settingsStore.setItem('tep:incrementalPagination', String(incrementalPagination)); } catch { /* ignore */ } }, [incrementalPagination]);
  useEffect(() => { try { settingsStore.setItem('tep:relaxedMode', String(relaxedMode)); } catch { /* ignore */ } }, [relaxedMode]);
  useEffect(() => { try { settingsStore.setItem('tep:ledgerFullDocs', String(showFullTransactions)); } catch { /* ignore */ } }, [showFullTransactions]);
  // The "whole documents" anchor is Ledger-only. Push it into the data context
  // (read from a ref at fetch time) so every grid read routes to the anchor
  // endpoint while ON. Kept current here; the refetch effect below lists
  // `ledgerAnchor` so toggling re-fires a fetch.
  const ledgerAnchor = isLedger(columnPrefsDst) && showFullTransactions ? 'TransactionId' : null;
  useEffect(() => { setAnchorColumn(ledgerAnchor); }, [ledgerAnchor, setAnchorColumn]);
  useEffect(() => { try { settingsStore.setItem('tep:charView', String(charViewEnabled)); } catch { /* ignore */ } }, [charViewEnabled]);
  useEffect(() => { try { settingsStore.setItem('tep:charViewCols', JSON.stringify([...charViewCols])); } catch { /* ignore */ } }, [charViewCols]);
  // Effective char-view columns passed to the table: empty (stable identity)
  // when the toggle is off so it never alters rendering, otherwise the picked
  // set. Memoized so it doesn't bust the table's rowCtx every render.
  const effectiveCharViewCols = useMemo(
    () => (charViewEnabled ? charViewCols : EMPTY_CHAR_VIEW_COLS),
    [charViewEnabled, charViewCols],
  );
  // Column layout saves target the DataSetType the current state was LOADED
  // for (columnPrefsLoadedDstRef), never the in-flight workspace, so a
  // mid-switch commit can't write one workspace's layout under another's key.
  // Each save is gated on IDENTITY against hydratedPrefsRef: the mount and
  // workspace-switch commits re-fire these effects with the just-loaded
  // values, and echoing those back used to DESTROY stored layouts whenever a
  // load failed or defaulted (save of null/[] REMOVES the key). Only genuine
  // user changes reach storage; each save records itself as the new baseline.
  useEffect(() => {
    if (hiddenColumns === hydratedPrefsRef.current.hidden) return;
    saveHiddenColumns(columnPrefsLoadedDstRef.current, hiddenColumns);
    hydratedPrefsRef.current.hidden = hiddenColumns;
  }, [hiddenColumns]);
  useEffect(() => {
    if (columnOrder === hydratedPrefsRef.current.order) return;
    saveColumnOrder(columnPrefsLoadedDstRef.current, columnOrder);
    hydratedPrefsRef.current.order = columnOrder;
  }, [columnOrder]);
  useEffect(() => {
    if (sortOverride === hydratedPrefsRef.current.sort) return;
    try {
      if (sortOverride) settingsStore.setItem('tep:sortOverride', JSON.stringify(sortOverride));
      else settingsStore.removeItem('tep:sortOverride');
    } catch { /* ignore */ }
    hydratedPrefsRef.current.sort = sortOverride;
  }, [sortOverride]);
  useEffect(() => {
    if (columnWidths === hydratedPrefsRef.current.widths) return;
    saveColumnWidths(columnPrefsLoadedDstRef.current, columnWidths);
    hydratedPrefsRef.current.widths = columnWidths;
  }, [columnWidths]);

  // Track builder panel height so the table can adjust its maxHeight
  useEffect(() => {
    const el = builderRef.current;
    if (!builderOpen || !el) { setBuilderHeight(0); return; }
    const ro = new ResizeObserver(([entry]) => setBuilderHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [builderOpen]);

  // Track the builder body's natural content height so the expand max-height
  // fits it exactly (never clips the footer/Collapse) while still animating.
  // Observing the inner body — whose layout height is its true content even
  // while the parent clamps + clips — also catches growth as the operator
  // expands more attributes/rules.
  useEffect(() => {
    const el = builderBodyRef.current;
    if (!builderOpen || !el) { setBuilderBodyHeight(null); return; }
    const ro = new ResizeObserver(([entry]) => setBuilderBodyHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [builderOpen]);

  // Belt-and-braces re-measure on collapse / expand. The grid-template-rows
  // transition runs over 300ms; ResizeObserver should pick up the
  // intermediate frames AND the final size, but browsers batch RO callbacks
  // and the final reading can be missed when the transition ends on the
  // same frame as a re-render. Without this, the table's maxHeight stays
  // anchored to the expanded builder size and operators don't see the
  // extra rows the collapse was meant to free up. Reads
  // `getBoundingClientRect().height` after the transition lands so the
  // table's maxHeight calc always converges to the truth.
  useEffect(() => {
    if (!builderOpen) return;
    const t = setTimeout(() => {
      const el = builderRef.current;
      if (el) setBuilderHeight(el.getBoundingClientRect().height);
    }, 320);
    return () => clearTimeout(t);
  }, [builderCollapsed, builderOpen]);

  // Reset the collapse toggle whenever the builder closes so the next open
  // starts expanded — operators rarely want a freshly-opened builder hidden.
  useEffect(() => {
    if (!builderOpen) setBuilderCollapsed(false);
  }, [builderOpen]);

  // Builder Validity → statement-date range filter (Ledger V2: PostingDate),
  // wired through the same named-filter pipeline the DynamicFilters
  // DateFilter uses, so the request that hits GetTEPTransactions carries
  // identical FilteringProperties entries whether the operator set the range
  // from the filter bar or from the inline rule builder.
  //
  // The pipeline expects keys shaped like `${FilterDefinition.Tag}_GTE` /
  // `_LTE`, where the Tag comes from the backend's filter catalog (it
  // happens to be "StatementDate" in the live statement snapshot but we look
  // it up at runtime so the wire stays correct across deployments and across
  // any future filter-Tag renames). In sample mode `filterDefinitions` is
  // empty, so the mirror is a no-op and the client-side filteredData
  // check below is the only enforcement.
  //
  // Mirror semantics: bidirectional on the SET→UNSET transition. When
  // Validity carries a bound we push it into the named filter; when a
  // bound transitions from set to null (operator cleared the field or
  // clicked "Remove Validity") we drop the corresponding filter key so
  // the chip clears too. Tracking the PREVIOUS validity via a ref is
  // what makes this safe: the open-time render where validity is null
  // and was always null leaves the filter alone, so an operator who
  // pre-set a Statement Date filter before opening the rule builder
  // doesn't lose that scope on open. Only an explicit operator-driven
  // transition (set → null) triggers a clear. The inverse-seed effect
  // below populates validity from the existing filter on open, so by
  // the time the operator interacts with the validity fields the two
  // surfaces are in sync.
  const validityStartDate = builder.formState.validity.StartDate;
  const validityEndDate = builder.formState.validity.EndDate;
  const statementDateFilterTag = useMemo<string | null>(() => {
    const def = filterDefinitions.find(
      (d) =>
        d.Type === 'DATE' &&
        d.Values.some((v) => v.Column === 'StatementDate' || v.Column === 'PostingDate'),
    );
    return def?.Tag ?? null;
  }, [filterDefinitions]);

  // Ledger journal-entry zebra banding master switch: only in the PRISTINE
  // default view. Any active filter chip, Show Only toggle, or tag drill-down
  // removes the banding entirely (the table additionally requires the default
  // sort — see TransactionTable's ledgerBands). Ledger's base scope travels
  // via activeExtraFilters, so an untouched view has an empty `filters` map.
  const journalBanding = useMemo(
    () => {
      if (!isLedger(columnPrefsDst)) return false;
      // "Show full transactions" ON: every document in the grid is complete by
      // construction (the anchor read pulls all legs), so the bands are always
      // truthful even with filters active. (The table still requires the
      // default sort — under a click-sort legs scatter and ledgerBands bails.)
      if (showFullTransactions) return true;
      // OFF: bands are pristine-view only — a filter could hide legs and make
      // groups misleading.
      return (
        Object.values(filters).every((v) => v.size === 0) &&
        !showOnlyUntagged &&
        !showOnlyMultiTagged &&
        !showOnlyDeadEnd &&
        !tagClickState
      );
    },
    [columnPrefsDst, showFullTransactions, filters, showOnlyUntagged, showOnlyMultiTagged, showOnlyDeadEnd, tagClickState],
  );
  const prevValidityRef = useRef<{ start: string | null; end: string | null }>({
    start: validityStartDate,
    end: validityEndDate,
  });
  // Look up the Transaction Types filter's named-Tag too so the
  // builder's Transaction Type dropdown can drive the chip. Uses the shared
  // resolver so the chip targets the def the filter bar actually renders
  // (Ledger responses carry a master type catalog alongside the real filter).
  const transactionTypeFilterTag = useMemo<string | null>(() => {
    return findTransactionTypeFilterDef(filterDefinitions)?.Tag ?? null;
  }, [filterDefinitions]);
  const builderTransactionType = builder.formState.transactionTypeCode;
  const prevBuilderTtcRef = useRef<string>(builderTransactionType);
  useEffect(() => {
    if (!statementDateFilterTag || !builderOpen) {
      // Builder closed (or no DATE filter definition available, e.g.
      // sample mode). Keep the ref's idea of "previous validity" in
      // sync with what's actually in state so the next time the
      // builder opens we don't see a stale set→null transition.
      prevValidityRef.current = { start: validityStartDate, end: validityEndDate };
      return;
    }
    const prev = prevValidityRef.current;
    prevValidityRef.current = { start: validityStartDate, end: validityEndDate };
    const gteKey = `${statementDateFilterTag}_GTE`;
    const lteKey = `${statementDateFilterTag}_LTE`;
    setFilters((prevFilters) => {
      const next = { ...prevFilters };
      let changed = false;
      // StartDate → GTE
      if (validityStartDate) {
        const cur = prevFilters[gteKey];
        if (!cur || cur.size !== 1 || !cur.has(validityStartDate)) {
          next[gteKey] = new Set([validityStartDate]);
          changed = true;
        }
      } else if (prev.start && prevFilters[gteKey] !== undefined) {
        // Operator transitioned StartDate from set → null. Drop the
        // matching filter key so the chip in the filter row clears.
        delete next[gteKey];
        changed = true;
      }
      // EndDate → LTE (symmetric)
      if (validityEndDate) {
        const cur = prevFilters[lteKey];
        if (!cur || cur.size !== 1 || !cur.has(validityEndDate)) {
          next[lteKey] = new Set([validityEndDate]);
          changed = true;
        }
      } else if (prev.end && prevFilters[lteKey] !== undefined) {
        delete next[lteKey];
        changed = true;
      }
      return changed ? next : prevFilters;
    });
  }, [builderOpen, validityStartDate, validityEndDate, statementDateFilterTag]);

  // Builder Transaction Type → Transaction Types filter chip mirror.
  // Same set→null transition semantics as the validity mirror above:
  // the chip updates when the operator picks/changes/removes a type
  // inside the rule builder, but the open-time render with no
  // builder selection doesn't wipe a pre-existing chip selection.
  // The previous render's value is tracked via `prevBuilderTtcRef`;
  // only an explicit `set → ''` transition clears the filter key.
  useEffect(() => {
    if (!transactionTypeFilterTag || !builderOpen) {
      prevBuilderTtcRef.current = builderTransactionType;
      return;
    }
    const prev = prevBuilderTtcRef.current;
    prevBuilderTtcRef.current = builderTransactionType;
    setFilters((prevFilters) => {
      const next = { ...prevFilters };
      let changed = false;
      if (builderTransactionType) {
        const cur = prevFilters[transactionTypeFilterTag];
        if (!cur || cur.size !== 1 || !cur.has(builderTransactionType)) {
          next[transactionTypeFilterTag] = new Set([builderTransactionType]);
          changed = true;
        }
      } else if (prev && prevFilters[transactionTypeFilterTag] !== undefined) {
        delete next[transactionTypeFilterTag];
        changed = true;
      }
      return changed ? next : prevFilters;
    });
  }, [builderOpen, builderTransactionType, transactionTypeFilterTag]);

  // Inverse seed: when the operator opens the rule builder while a
  // Statement Date filter is already active, copy the filter's bounds
  // INTO the builder's Validity section so the rule they're authoring
  // inherits the scope they were already looking at. Fires once per
  // open transition (`builderOpen` false → true), not on every render,
  // because the Validity → filter mirror above would otherwise treat
  // every render where the filter is set as "validity changed, write
  // it back" and we'd ping-pong. Skips when validity is already set
  // (operator's edit wins) or when no filter is active.
  const prevBuilderOpenRef = useRef(builderOpen);
  useEffect(() => {
    const wasOpen = prevBuilderOpenRef.current;
    prevBuilderOpenRef.current = builderOpen;
    // Clear the one-shot MT940-clone TTC-skip flag whenever the builder is
    // closed, so a suggestion clicked while the builder was already open
    // (no open-transition to consume it) can't suppress a later genuine open.
    if (!builderOpen) cloneMt940SkipTtcRef.current = false;
    if (wasOpen || !builderOpen) return;
    // Validity ← Statement Date filter
    if (statementDateFilterTag && !validityStartDate && !validityEndDate) {
      const gteKey = `${statementDateFilterTag}_GTE`;
      const lteKey = `${statementDateFilterTag}_LTE`;
      const filterFrom = [...(filters[gteKey] ?? [])][0];
      const filterTo = [...(filters[lteKey] ?? [])][0];
      if (filterFrom || filterTo) {
        builder.updateBasicInfo({
          validity: {
            StartDate: filterFrom ?? null,
            EndDate: filterTo ?? null,
          },
        });
      }
    }
    // Transaction Type ← chip filter. Only seeds when the chip carries
    // exactly one value — the builder's dropdown is single-select, so a
    // multi-value chip can't be losslessly copied into it, and we'd
    // rather leave the builder empty than narrow the operator's view
    // arbitrarily. The mirror above will pick up a subsequent
    // operator-driven change to the builder dropdown.
    if (transactionTypeFilterTag && !builderTransactionType && !cloneMt940SkipTtcRef.current) {
      const chipValues = filters[transactionTypeFilterTag];
      if (chipValues && chipValues.size === 1) {
        const onlyValue = [...chipValues][0];
        builder.updateBasicInfo({ transactionTypeCode: onlyValue });
      }
    }
    // One-shot: an MT940-suggestion clone must keep Transaction Type empty.
    cloneMt940SkipTtcRef.current = false;
  // We deliberately depend ONLY on `builderOpen` here. Reading the
  // current filter and validity values from closure on each open is
  // the intended behavior — including them in deps would re-run the
  // effect mid-session and re-seed validity any time the filter
  // changed, fighting the operator's edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderOpen]);


  const activeColumnSpec = useMemo(() => getColumnSpec(columnPrefsDst), [columnPrefsDst]);

  const defaultHiddenColumns = useMemo(() => {
    // Show the debit column only when the checked-out side produces debit rows,
    // and the credit column only when it produces credit rows. When no checkout
    // is active (or the workspace has no side, e.g. Ledger), keep both visible.
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
      // Anything outside this DataSetType's default-visible set starts
      // hidden — including fields unknown to the spec (a future backend
      // addition), which stay offerable in the picker but never default-on.
      if (activeColumnSpec.defaultVisible.has(col.key) && !activeColumnSpec.neverShow.has(col.key)) continue;
      s.add(col.key);
    }
    return s;
  }, [tableColumns, activeCheckout?.side, activeColumnSpec]);

  // When hiddenColumns is null (no stored preference), use defaults. The
  // per-type never-show fields are ALWAYS folded in so a stale saved
  // preference can't reveal a column this DataSetType never populates.
  const effectiveHiddenColumns = useMemo(() => {
    const base = hiddenColumns ?? defaultHiddenColumns;
    let result = base;
    for (const key of activeColumnSpec.neverShow) {
      if (result.has(key)) continue;
      if (result === base) result = new Set(base);
      result.add(key);
    }
    return result;
  }, [hiddenColumns, defaultHiddenColumns, activeColumnSpec]);

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

  // Reset the CURRENT workspace's layout to the spec defaults (visible set,
  // order, and widths) — other workspaces' saved layouts are untouched.
  // hiddenColumns → null drops the saved preference entirely so future
  // default changes apply without another reset.
  const handleColumnReset = useCallback(() => {
    setHiddenColumns(null);
    setColumnOrder([]);
    setColumnWidths({});
  }, []);

  // Base filters from checkout — "clear filters" resets to these instead of empty
  // In live mode, keys must match filter definition Tags (e.g. "BANKS", "SIDE")
  // rather than column names, so translateFilters can find the matching definition.
  const baseFilters = useMemo(() => {
    if (!activeCheckout) return undefined;
    // Ledger has no bank/side; its ClientCode/ErpCode scope is applied via
    // activeExtraFilters (identityScopeFilters), not as UI filter chips.
    if (isLedger(activeCheckout.dataSetType)) return undefined;
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

  // Tags of the "Show Only" (LIST+EQ boolean-flag) filter definitions. The
  // Backlog badges are reflected into these checkboxes by the sync above.
  const showOnlyFilterTags = useMemo(
    () => filterDefinitions.filter((d) => d.Type === 'LIST' && d.Operand === 'EQ').map((d) => d.Tag),
    [filterDefinitions],
  );

  // Wrap the filter-change handler so a MANUAL change to a Show Only flag drops
  // the Backlog badge's auto-applied scope (`activePillFilters`). The badge
  // both applies its flag as an extra server filter AND ticks the reflected
  // checkbox; without this, unticking the checkbox cleared only the checkbox
  // and the extra filter kept the table pinned to the badge's rows (e.g.
  // Invalid Attributes stayed at 2). Only a Show Only change clears the pill —
  // other filters (IBAN, Amount, …) leave it intact so a badge scope still
  // composes with manual narrowing (e.g. Clean badge + IBAN search).
  const handleFiltersChange = useCallback((next: Record<string, Set<string>>) => {
    if (activePillFilters.length > 0) {
      const showOnlyChanged = showOnlyFilterTags.some((tag) => {
        const a = filters[tag];
        const b = next[tag];
        const aSize = a?.size ?? 0;
        const bSize = b?.size ?? 0;
        if (aSize !== bSize) return true;
        if (a && b) { for (const v of a) if (!b.has(v)) return true; }
        return false;
      });
      if (showOnlyChanged) setActivePillFilters([]);
    }
    setFilters(next);
  }, [activePillFilters.length, showOnlyFilterTags, filters]);

  // Clear hidden tag specs when the checkout actually changes (release,
  // check-in, switching to a different bank/side). The initial-render
  // restore is handled by the useState lazy initializer above, so this
  // effect skips its mount-time fire — only a genuine change of bank/side
  // triggers the wipe.
  const checkoutKey = activeCheckout ? identityKeySuffix(activeCheckout) : null;
  const lastCheckoutRef = useRef<string | null>(checkoutKey);
  useEffect(() => {
    if (lastCheckoutRef.current === checkoutKey) return;
    lastCheckoutRef.current = checkoutKey;
    setHiddenDefIds(new Set());
    setHiddenTagsPanelOpen(false);
  }, [checkoutKey]);

  // Persist the set on every change, scoped to the current checkout identity.
  useEffect(() => {
    try {
      if (hiddenDefIds.size === 0 || checkoutKey == null) {
        sessionStorage.removeItem(HIDDEN_DEF_IDS_STORAGE_KEY);
      } else {
        sessionStorage.setItem(
          HIDDEN_DEF_IDS_STORAGE_KEY,
          JSON.stringify({ key: checkoutKey, ids: [...hiddenDefIds] }),
        );
      }
    } catch { /* storage disabled — in-memory state still works */ }
  }, [hiddenDefIds, checkoutKey]);

  // Close the side panel once the last hidden tag spec is removed so it
  // doesn't linger as an empty drawer.
  useEffect(() => {
    if (hiddenDefIds.size === 0) setHiddenTagsPanelOpen(false);
  }, [hiddenDefIds]);

  // Live mode: the filter-change refetch effect lives further down, after
  // the visible-rows engine is instantiated (it routes through
  // `engine.refetch()`, which honors the operator's last +N / Show all
  // choice in VISIBLE space).

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
  // backend has persisted the rule (which would cause GetTEPTransactions
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
      const filtersPayload: FilterProperty[] = [
        ...translateFilters(outgoingFilters, filterDefinitions),
        ...activeExtraFilters,
      ];
      //   3. Hidden tag specs — exclude them server-side with the SAME two
      //      `NI` filters the live view uses (`replaceFromBeginningExcluding`).
      //      The backend keeps untagged rows under `NI`, so this matches the
      //      visible row set exactly without dropping untagged rows.
      if (hiddenDefIds.size > 0) {
        const hiddenValue = [...hiddenDefIds].join('|');
        filtersPayload.push(
          { ColumnName: 'OpsTagSpecDefinitionId', Value: hiddenValue, Operand: 'NI' },
          { ColumnName: 'OpsMultiTags.TagSpecDefinitionId', Value: hiddenValue, Operand: 'NI' },
        );
      }
      await downloadCenter.triggerExport(filtersPayload, effectiveSorting);
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
  }, [downloadCenter, outgoingFilters, filterDefinitions, activeExtraFilters, effectiveSorting, hiddenDefIds]);

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
      const swapped = effectiveLibraries.map((lib) => {
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
      // Sample mode evaluates real libraries locally, so the in-place swap
      // above is enough — the edited rules match new rows and extract
      // attributes client-side.
      if (!isLiveMode) return swapped;
      // Live mode is the bug: analyzeRow trusts the backend's Ops tags for
      // SAVED libraries and does NOT re-evaluate their rules locally (see
      // analyzeRow's `useBackendTags && !isPreviewLib` guard). So a broadened
      // edit's newly-matched rows aren't tagged/extracted client-side until
      // the backend retags on check-in — the "new records show no attribute
      // extractions" report. Expose the edited def through a preview library
      // (empty parent Context ⇒ evaluated locally, exactly like a NEW rule's
      // preview) so its in-progress rules run against the loaded rows and new
      // matches get client-side extraction immediately. Id is preserved so it
      // dedupes against any backend Ops tag and getAttributeValue's
      // activeDefinitionId lookup resolves it.
      const editPreviewLib: TagSpecLibrary = {
        Id: 'edit-preview-lib',
        ActiveTagSpecLibId: null,
        OperatorId: '',
        StatusTag: 'ACTIVE',
        DataSetType: activeCheckout?.dataSetType ?? DEFAULT_DATA_SET_TYPE,
        Version: 1,
        IsLatestVersion: true,
        VersionDate: '',
        Context: [],
        TagSpecDefinitions: [{ ...tempDefinition, Id: editingDef.Id }],
      };
      return [...swapped, editPreviewLib];
    }

    const previewLib: TagSpecLibrary = {
      Id: 'preview-lib',
      ActiveTagSpecLibId: null,
      OperatorId: '',
      StatusTag: 'ACTIVE',
      DataSetType: activeCheckout?.dataSetType ?? DEFAULT_DATA_SET_TYPE,
      Version: 1,
      IsLatestVersion: true,
      VersionDate: '',
      Context: [], // Empty context — matches all rows for preview
      TagSpecDefinitions: [tempDefinition],
    };
    return [...effectiveLibraries, previewLib];
  }, [effectiveLibraries, tempDefinition, editingDef, activeCheckout?.dataSetType, isLiveMode]);

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

  // Intraday helper, step 1: the candidate MT940 defs (same bank + side) an
  // operator tagging MT942 / INTERIM_MT940 may clone. Gated to intraday
  // workspaces — MT940 itself needs no suggestions, and Ledger shares no rules
  // with MT940. Dedupe by def.Id, keeping the most-current source (INPROGRESS
  // draft over ACTIVE release, then higher Version) — mirrors the picker.
  // Excludes defs whose Tag already exists in the intraday library for this
  // bank/side (already cloned — suggesting it again is noise).
  const mt940SuggestionDefs = useMemo(() => {
    const dst = activeCheckout?.dataSetType;
    if (!isLiveMode || !activeCheckout || (dst !== 'MT942' && dst !== 'INTERIM_MT940')) return [];
    const existingIntradayTags = new Set<string>();
    for (const lib of libraries) {
      if (lib.DataSetType !== dst) continue;
      if (getContextValue(lib.Context, 'BankSwiftCode') !== activeCheckout.bank) continue;
      if (getContextValue(lib.Context, 'Side') !== activeCheckout.side) continue;
      for (const def of lib.TagSpecDefinitions) existingIntradayTags.add(def.Tag);
    }
    const defById = new Map<string, { def: TagSpecDefinition; score: number }>();
    for (const lib of libraries) {
      if (lib.DataSetType !== DEFAULT_DATA_SET_TYPE) continue;
      if (getContextValue(lib.Context, 'BankSwiftCode') !== activeCheckout.bank) continue;
      if (getContextValue(lib.Context, 'Side') !== activeCheckout.side) continue;
      const score = (lib.StatusTag === 'INPROGRESS' ? 1_000_000 : 0) + (lib.Version ?? 0);
      for (const def of lib.TagSpecDefinitions) {
        if (def.StatusTag !== 'ACTIVE' || def.TagRuleExpressions.length === 0) continue;
        if (existingIntradayTags.has(def.Tag)) continue;
        const existing = defById.get(def.Id);
        if (existing && existing.score >= score) continue;
        defById.set(def.Id, { def, score });
      }
    }
    return Array.from(defById.values(), (v) => v.def);
  }, [isLiveMode, activeCheckout, libraries]);

  // Step 2: an ON-DEMAND per-row lookup instead of a prebuilt map. A map keyed
  // by row reference (or id) is built from ONE buffer snapshot and silently
  // misses when the table renders rows from a NEWER buffer (classic page nav /
  // refills replace every row object — the "suggestions only on the first
  // page" bug). Computing at render time for exactly the row object being
  // rendered cannot go stale. A WeakMap memoizes per row object so the
  // per-row × per-def evaluation runs once per row, not on every scroll
  // frame; the cache (and the function identity, which busts rowCtx) resets
  // whenever the candidate defs change.
  const getMt940Suggestions = useMemo(() => {
    if (mt940SuggestionDefs.length === 0) return undefined;
    const cache = new WeakMap<TransactionRow, TagSpecDefinition[]>();
    const today = new Date().toISOString().split('T')[0];
    return (row: TransactionRow): TagSpecDefinition[] => {
      let matches = cache.get(row);
      if (!matches) {
        matches = matchingMt940Defs(mt940SuggestionDefs, row, today);
        cache.set(row, matches);
      }
      return matches;
    };
  }, [mt940SuggestionDefs]);

  // Clone a suggested MT940 rule into a NEW intraday tag: open the Rule
  // Builder in create mode (for the current intraday checkout), pre-fill the
  // MT940 tag name, and clone its rule sets + attributes. The operator reviews
  // and clicks Create; bank/side/DataSetType come from the checkout at save.
  const handleCloneMt940Suggestion = useCallback((def: TagSpecDefinition) => {
    builder.resetForm();
    builder.applyTemplate(def);
    // Transaction Type: DON'T carry over the MT940 rule's TTC (MT940 and MT942
    // use different codes). Instead take it from the FIRST intraday transaction
    // this rule matches — that row carries the correct intraday code (e.g.
    // MSC). The ref suppresses the on-open single-value-chip TTC seed so this
    // value wins for the one open.
    let ttc = '';
    if (getMt940Suggestions) {
      for (const row of transactions) {
        const sugg = getMt940Suggestions(row);
        if (sugg.some((d) => d.Id === def.Id)) {
          ttc = String(row['TransactionTypeCode'] ?? '');
          break;
        }
      }
    }
    builder.updateBasicInfo({ tag: def.Tag, transactionTypeCode: ttc });
    cloneMt940SkipTtcRef.current = true;
    setBuilderOpen(true);
  }, [builder, transactions, getMt940Suggestions]);

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
    g.conditions.some(isFilledCondition)
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
      ? {
          ...builder.formState,
          bankSwiftCode: activeCheckout.bank,
          side: activeCheckout.side,
          dataSetType: activeCheckout.dataSetType,
          clientCode: activeCheckout.clientCode ?? '',
          erpCode: activeCheckout.erpCode ?? '',
        }
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

  // Lock the matching-tags group from the moment an Exclude is clicked until
  // the recomputed match set lands. `matchingTagsLoading` alone isn't enough:
  // it only flips true after the 700ms debounce in useMatchingTagIds, leaving
  // a window where the displayed set is stale but still clickable. Held here
  // and cleared when the reload's loading flag falls back to false.
  const [excludePending, setExcludePending] = useState(false);
  const prevMatchingLoadingRef = useRef(matchingTagsLoading);
  useEffect(() => {
    // Closing the builder ends any in-flight preview — drop the lock so it
    // can't survive into the next session.
    if (!builderOpen) { setExcludePending(false); prevMatchingLoadingRef.current = false; return; }
    // Reload finished (loading fell true→false) → release the lock.
    if (prevMatchingLoadingRef.current && !matchingTagsLoading) setExcludePending(false);
    prevMatchingLoadingRef.current = matchingTagsLoading;
  }, [matchingTagsLoading, builderOpen]);
  const matchingTagsLocked = excludePending || matchingTagsLoading;

  // Read-only preview drawer for tags clicked in the "Existing Matching Tags"
  // section. Distinct from `handleTagClick` (which loads a tag into the builder
  // and would wipe in-progress draft state) — this surface must not disturb
  // whatever the user is currently authoring.
  const [previewDef, setPreviewDef] = useState<TagSpecDefinition | null>(null);



  // Analyze all rows — chunked async so a 44k-row Show-all doesn't
  // block the React commit / pagination footer behind a single
  // 30s+ synchronous useMemo.
  //
  // The previous implementation was a synchronous `useMemo` that ran
  // `analyzeRow` over every loaded transaction before React committed.
  // For Show-all on a busy dataset that meant the pagination skeleton
  // stayed visible (and the loading flag stayed effectively "true"
  // from the operator's perspective) for as long as the analysis
  // took — minutes on 44k rows even with the regex / scratch hoisting
  // wins.
  //
  // New shape: keep `analyzedData` as React state, populate it in
  // chunks via `requestIdleCallback` (with a setTimeout fallback so we
  // still progress on browsers that lack ric or while the tab is idle
  // for long enough that the browser holds the IC). Each chunk
  // commits a partial array so the table renders rows + analyzed
  // tag/attribute cells progressively. The cancel ref bumps on each
  // effect re-run so a stale chunked pass can never overwrite a
  // newer one's state.
  const [analyzedData, setAnalyzedData] = useState<AnalyzedTransaction[]>([]);
  const analyzeRunRef = useRef(0);
  useEffect(() => {
    const runId = ++analyzeRunRef.current;
    // Empty transactions: drop to empty immediately and skip the
    // chunking dance. Common path after a filter change that returns
    // zero rows; no need to spin up RIC.
    if (transactions.length === 0) {
      setAnalyzedData([]);
      return;
    }
    const scratch = buildAnalyzeScratch(allLibraries);
    // Chunk size tuned for ~10-15ms per chunk on a mid-range machine
    // — small enough to keep frame budget healthy, large enough that
    // we don't spend most of the time on RIC overhead. The browser
    // can re-tune by giving us a smaller `deadline.timeRemaining()`
    // budget per chunk.
    const CHUNK_SIZE = 500;
    const builderActive = builderOpen && builderHasContent;
    const tagClickActive = tagClickState !== null;
    const editingDefId = editingDef?.Id;
    const acc: AnalyzedTransaction[] = [];

    const processChunk = (start: number) => {
      if (runId !== analyzeRunRef.current) return; // newer run took over
      const end = Math.min(start + CHUNK_SIZE, transactions.length);
      for (let i = start; i < end; i++) {
        const row = transactions[i];
        const analysis = analyzeRow(row, allLibraries, isLiveMode, scratch);
        // Apply the rule-builder preview filter inline so the
        // resulting array matches the old `.map().filter()` contract.
        // Mirrors the original branching: when the builder is open and
        // has content, only rows that match the preview survive (or
        // every row when a tag-click scope is active server-side).
        if (builderActive && !tagClickActive) {
          if (editingDefId) {
            if (!analysis.matchedDefinitions.some(d => d.Id === editingDefId)) continue;
          } else if (!analysis.tags.includes('Preview')) {
            continue;
          }
        }
        acc.push({ row, analysis });
      }
      // Commit progress. `[...acc]` keeps each render a distinct
      // reference so memoized consumers (filteredData, hiddenTagItems,
      // etc.) detect the change. Reading the same `acc` mutably across
      // commits would let stale renders see future rows.
      if (runId === analyzeRunRef.current) {
        setAnalyzedData([...acc]);
      }
      if (end < transactions.length) {
        scheduleNextChunk(end);
      }
    };

    const scheduleNextChunk = (next: number) => {
      // requestIdleCallback yields to the browser between chunks so
      // the table can paint and the operator can interact. Falls back
      // to setTimeout(0) on browsers without RIC (Safari < 16, etc.)
      // — same yield semantics, slightly less considerate of frame
      // budget but still unblocks the main thread.
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => processChunk(next));
      } else {
        setTimeout(() => processChunk(next), 0);
      }
    };

    // First chunk runs synchronously so the table at least gets a
    // partial render in the SAME commit as the setTransactions —
    // avoids a single frame of empty state.
    processChunk(0);

    return () => {
      // Bump runId so any pending chunk callbacks observe `runId !==
      // analyzeRunRef.current` and bail out without committing.
      analyzeRunRef.current++;
    };
  }, [transactions, allLibraries, isLiveMode, builderOpen, builderHasContent, tagClickState, editingDef, tempDefinition]);

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

  // The hide / unhide handlers live further down, after the visible-rows
  // engine — they notify it so a hide refills the table back to the
  // operator's previous visible row count (1 count + 1 data call).

  // Strip hidden tag specs from each row's DISPLAY analysis. Live mode
  // excludes FULLY-hidden rows server-side (the two-NI filter), but rows
  // that are multi-tagged with a MIX of hidden and visible definitions are
  // correctly KEPT by the server — they still have a visible tag. Those
  // kept rows must not render their hidden-tag badges/attributes, so we
  // drop hidden defs from the per-row analysis here (tags + matched
  // definitions are parallel arrays; attributes are keyed by def id). Rows
  // with nothing hidden return their original object so referential
  // stability for the memoized table rows holds (gotcha #23). The raw
  // `analyzedData` stays intact for the Hidden Tags panel lookup.
  const displayAnalyzedData = useMemo(() => {
    if (!isLiveMode || hiddenDefIds.size === 0) return analyzedData;
    return analyzedData.map((item) => {
      const md = item.analysis.matchedDefinitions;
      if (!md.some((d) => d && hiddenDefIds.has(d.Id))) return item;
      const tags: string[] = [];
      const matchedDefinitions: typeof md = [];
      md.forEach((d, i) => {
        if (d && hiddenDefIds.has(d.Id)) return;
        tags.push(item.analysis.tags[i]);
        matchedDefinitions.push(d);
      });
      // Build the stripped analysis WITHOUT spreading `item.analysis` (the
      // spread would invoke its lazy `attributes` getter, forcing eager
      // extraction). Attributes stay lazy here too: only computed if a
      // consumer reads them, and filtered to the kept (non-hidden) defs.
      let attrCache: typeof item.analysis.attributes | undefined;
      return {
        ...item,
        analysis: {
          tags,
          matchedDefinitions,
          get attributes() {
            if (attrCache === undefined) {
              const full = item.analysis.attributes;
              attrCache = {};
              for (const d of matchedDefinitions) {
                if (d && full[d.Id]) attrCache[d.Id] = full[d.Id];
              }
            }
            return attrCache;
          },
        },
      };
    });
  }, [analyzedData, hiddenDefIds, isLiveMode]);

  // Apply all filters
  const filteredData = useMemo(() => {
    let result = displayAnalyzedData;

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
        // In live mode, data-field filtering is handled server-side by the API.
        // Sample mode skips range-shaped keys (`Tag_GTE` / `Tag_LTE`) here —
        // the loop's exact-match semantics would otherwise drop every row
        // (no row carries a `StatementDate_GTE` column). DATE / DECIMAL
        // range filters need a dedicated range comparison; the only one we
        // currently surface in sample mode is the builder's Validity, which
        // is enforced by the explicit StatementDate check further below.
        if (field.endsWith('_GTE') || field.endsWith('_LTE')) continue;
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

    // Builder Validity filter. Narrows the table to rows whose StatementDate
    // falls within the rule's validity window, in BOTH modes:
    //  - Sample mode: no StatementDate chip exists, so read the bound straight
    //    from the builder's form validity.
    //  - Live mode: read the bound from the StatementDate chip (the
    //    server-synced value the validity→chip mirror keeps in step with the
    //    form). Keying on the CHIP rather than raw form validity is what makes
    //    this safe: clearing the chip in the filter row turns the client mask
    //    off too, so we don't reintroduce the stale-hide the old
    //    `!isLiveMode` gate guarded against. The server already filters by the
    //    same chip, so this is normally a no-op safety net — but when the
    //    operator REMOVES the rule (e.g. via the inline builder's Remove
    //    Group), `handleApplyRules` broadens the live scope to bank/side with
    //    an empty REGEX, dropping the definition-ID scope that was implicitly
    //    enforcing validity; without this client pass those out-of-validity
    //    rows leak into the table. The count logic (`validityFilterActive`)
    //    already collapses to `filteredLen` on the assumption this runs, so
    //    skipping it left the counts and the visible rows disagreeing.
    // Trim any T-suffix from both sides so a backend that ships ISO datetimes
    // (and the ISO-lifted validity bound) compares cleanly as YYYY-MM-DD.
    let validityFrom: string | undefined;
    let validityTo: string | undefined;
    if (builderOpen && !isLiveMode) {
      validityFrom = validityStartDate ?? undefined;
      validityTo = validityEndDate ?? undefined;
    } else if (builderOpen && isLiveMode && statementDateFilterTag) {
      validityFrom = [...(filters[`${statementDateFilterTag}_GTE`] ?? [])][0];
      validityTo = [...(filters[`${statementDateFilterTag}_LTE`] ?? [])][0];
    }
    if (validityFrom || validityTo) {
      const from = validityFrom?.split('T')[0];
      const to = validityTo?.split('T')[0];
      result = result.filter((item) => {
        // Ledger V2 rows carry PostingDate instead of StatementDate.
        const raw = item.row['StatementDate'] ?? item.row['PostingDate'];
        if (raw == null) return false;
        const sd = String(raw).split('T')[0];
        if (from && sd < from) return false;
        if (to && sd > to) return false;
        return true;
      });
    }

    // Nullary blank conditions (Is Blank or Empty / Is Not Blank or Empty)
    // can't be expressed as a regex that matches NULL columns in SQL —
    // see regexify.ts + buildRulesetFilters.ts — so the server filter
    // SKIPS them and we narrow client-side here using the rule
    // evaluator, which has null/empty/space/dash-aware semantics for
    // the nullary regex shapes (evaluateRuleSet.ts). Gated on
    // `rulesetApplied` so the table only narrows after the operator
    // explicitly applies the rule, matching the standard rule-builder
    // semantics (Save / Apply). Without this block, a rule with only
    // a blank-check would return zero rows because the backend filter
    // drops every NULL column instead of including them.
    const hasNullaryBlankCondition =
      builderOpen
      && (tagClickState?.rulesetApplied ?? false)
      && builder.formState.ruleGroups.some((g) =>
        g.conditions.some(
          (c) => c.operation === 'is_blank_or_empty' || c.operation === 'is_not_blank_or_empty',
        ),
      );
    if (hasNullaryBlankCondition && tempDefinition && tempDefinition.TagRuleExpressions.length > 0) {
      result = result.filter((item) =>
        tempDefinition.TagRuleExpressions.some((group) => evaluateRuleSet(group, item.row)),
      );
    }

    // Hidden-tag exclusion. LIVE mode excludes hidden rows SERVER-SIDE via
    // the dual query (replaceFromBeginningExcluding), so the buffer already
    // contains only visible rows — re-applying the client pass here would
    // double-filter with a DIFFERENT rule (isRowHidden hides on ANY matched
    // def incl. multi-tags, which the backend's composite NI need not
    // replicate) and silently drop server-vetted rows, shrinking the page.
    // So the client pass runs in SAMPLE mode only, where there is no server
    // to exclude.
    if (!isLiveMode && hiddenDefIds.size > 0) {
      result = result.filter(
        (item) => !isRowHidden(item.analysis.matchedDefinitions, hiddenDefIds),
      );
    }

    // Sample / upload mode: apply the alphabetical override client-side. Live
    // mode skips this — the backend already returns rows in the requested
    // order, and re-sorting would just burn CPU. Tiebreakers mirror
    // buildSortingProperties so equal values keep StatementDate / Sequence
    // order across both modes.
    if (!isLiveMode && sortOverride) {
      const dir = sortOverride.order === 'ASC' ? 1 : -1;
      const field = sortOverride.field;
      const sorted = [...result];
      sorted.sort((a, b) => {
        const av = String(a.row[field] ?? '');
        const bv = String(b.row[field] ?? '');
        const primary = av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true });
        if (primary !== 0) return primary * dir;
        const ad = String(a.row['StatementDate'] ?? '');
        const bd = String(b.row['StatementDate'] ?? '');
        const secondary = ad.localeCompare(bd);
        if (secondary !== 0) return secondary;
        const as = Number(a.row['Sequence'] ?? 0);
        const bs = Number(b.row['Sequence'] ?? 0);
        return as - bs;
      });
      result = sorted;
    }

    return result;
  }, [displayAnalyzedData, showOnlyUntagged, showOnlyMultiTagged, showOnlyDeadEnd, filters, isLiveMode, builderOpen, builder.formState.transactionTypeCode, builder.formState.ruleGroups, tempDefinition, tagClickState?.rulesetApplied, hiddenDefIds, sortOverride, validityStartDate, validityEndDate, statementDateFilterTag]);

  // Count of loaded rows that match any hidden tag spec. SAMPLE mode only:
  // live mode excludes hidden rows server-side, so the loaded buffer holds
  // zero hidden rows by construction and this is 0 (a non-zero value here
  // would wrongly shrink loadedNow against a buffer the server already
  // vetted). Sample mode has no server exclusion, so the client tally is
  // the real one.
  const hiddenLoadedCount = useMemo(() => {
    if (isLiveMode || hiddenDefIds.size === 0) return 0;
    let n = 0;
    for (const item of analyzedData) {
      if (isRowHidden(item.analysis.matchedDefinitions, hiddenDefIds)) n++;
    }
    return n;
  }, [isLiveMode, hiddenDefIds, analyzedData]);

  // Visible-rows engine: owns the visible-row target (50 default, raised
  // by +N / Show all / page nav, persisted per checkout), the scoped
  // hidden-row count, and the refill planning. Hiding tag specs is purely
  // client-side (the server NI filter dropped untagged rows — see the
  // activeExtraFilters comment), so `ensureVisible` overfetches by the
  // scoped hidden count (capped) and fires at most one exact-bound
  // follow-up. `totalShowing` / `totalHidden` are the single source of
  // truth for the header + footer counts — both totals share the active
  // filter scope, so the subtraction is exact (no clamped drift math).
  const engine = useVisibleRowsEngine({
    isLiveMode,
    transactions,
    totalTransactionsCount,
    fetchCount,
    replaceFromBeginning,
    replaceFromBeginningExcluding,
    outgoingFilters,
    activeExtraFilters,
    effectiveSorting,
    hiddenDefIds,
    hiddenLoadedCount,
    setSampleVisibleCount: setVisibleCount,
    checkoutBank: activeCheckout?.bank ?? null,
    checkoutSide: activeCheckout?.side ?? null,
  });
  const { ensureVisible, goToPage: engineGoToPage, refetch: engineRefetch, notifyHiddenSetChanged } = engine;

  // Live mode: fetch from API when filters or extraFilters change.
  // While a Backlog "edit" navigation is pending, skip auto-fetch — handleTagClick
  // will set tagClickState and this effect will re-fire with the scoped extra filter,
  // avoiding a broad fetch that would just be aborted.
  // Also wait for filterDefinitions to load before firing: while empty, baseFilters
  // uses sample-mode column-name keys that translateFilters drops, which would send
  // a request with no bank/side scope — pure waste, since the effect re-fires with
  // correct tag-name keys once definitions resolve.
  // `engineRefetch` re-ensures the persisted visible target (so Refresh /
  // tag toggle keep a Show-all window loaded) and reads the CURRENT
  // filters at call time; its identity is stable, so this effect fires
  // only on genuine scope changes (gotcha #16).
  useEffect(() => {
    if (!isLiveMode) return;
    if (filterDefinitions.length === 0) return;
    if (activeCheckout?.pendingDefinitionId) return;
    const timer = setTimeout(() => { void engineRefetch(); }, 50);
    return () => clearTimeout(timer);
  }, [isLiveMode, filterDefinitions.length, outgoingFilters, activeExtraFilters, activeCheckout?.pendingDefinitionId, effectiveSorting, ledgerAnchor, engineRefetch]);

  // Classic mode: a genuine scope change restarts at page 0 (the refetch
  // above replaces the buffer from the beginning).
  useEffect(() => {
    if (!isLiveMode || incrementalPagination) return;
    setCurrentPage(0);
    setPageInputValue('1');
  }, [isLiveMode, incrementalPagination, outgoingFilters, activeExtraFilters, effectiveSorting]);

  // Add the picked tag spec IDs to the hidden set, then hand the new set
  // to the engine so it refills the table back to the row count the
  // operator was just looking at (nothing happens when the buffer still
  // satisfies it). The engine receives the set directly — the state prop
  // hasn't propagated yet inside this tick.
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
    // What the operator is looking at right now: the displayed window in
    // incremental mode (buffer may over-satisfy the target; the table
    // only shows targetVisible rows), or the window covering the current
    // page in classic mode. This becomes the refill target.
    const previousVisibleShown = incrementalPagination
      ? Math.min(engine.targetVisible, filteredData.length)
      : (currentPage + 1) * BATCH_SIZE;
    setHideBusy(true);
    setToast({
      message: newDefIds.length === 1 && primaryName
        ? `Hiding tag spec '${primaryName}'…`
        : `Hiding ${newDefIds.length} tag specs…`,
      type: 'success',
    });
    window.setTimeout(() => {
      const next = new Set(hiddenDefIds);
      for (const d of newDefIds) next.add(d);
      setHiddenDefIds(next);
      if (!incrementalPagination && isLiveMode) {
        // Classic (per-page) mode: a prefix refill doesn't map onto a
        // single-page buffer, and the current page index may no longer
        // exist once rows are excluded. Return to page 1 and fetch page 0
        // with the new hidden set — engineGoToPage's dual query also
        // refreshes the visible/hidden counts.
        setCurrentPage(0);
        setPageInputValue('1');
        void engineGoToPage(0, { hiddenIdsOverride: next });
      } else {
        notifyHiddenSetChanged(next, 'hide', previousVisibleShown);
      }
      setToast({
        message: newDefIds.length === 1 && primaryName
          ? `Tag spec '${primaryName}' hidden`
          : `${newDefIds.length} tag specs hidden`,
        type: 'success',
      });
      // hideBusy stays true until the engine's refill fetch settles (see
      // the refilling-settle effect below) so the table skeleton covers
      // the whole operation, not just this 250ms beat.
    }, 250);
  }, [hiddenDefIds, analyzedData, allDefinitions, incrementalPagination, isLiveMode, filteredData, currentPage, engine.targetVisible, notifyHiddenSetChanged, engineGoToPage]);

  // Unhiding returns the operator to a clean starting view: the engine
  // resets its visible target to the initial PAGE_SIZE (50) and refetches
  // (the restored rows were excluded server-side, so they're not in the
  // buffer). Reset the classic page index + sample slice here to match, so
  // both paginators land on the first 50 even if more had been loaded.
  const resetToInitialWindow = useCallback(() => {
    setCurrentPage(0);
    setPageInputValue('1');
    setVisibleCount(BATCH_SIZE);
  }, []);

  const unhideTagDef = useCallback((defId: string, name: string) => {
    setHideBusy(true);
    setToast({ message: `Unhiding tag spec '${name}'…`, type: 'success' });
    window.setTimeout(() => {
      const next = new Set(hiddenDefIds);
      next.delete(defId);
      setHiddenDefIds(next);
      resetToInitialWindow();
      notifyHiddenSetChanged(next, 'unhide', 0);
      setToast({ message: `Tag spec '${name}' restored`, type: 'success' });
    }, 250);
  }, [hiddenDefIds, notifyHiddenSetChanged, resetToInitialWindow]);

  const unhideAllTags = useCallback(() => {
    setHideBusy(true);
    setToast({ message: 'Unhiding all tag specs…', type: 'success' });
    window.setTimeout(() => {
      setHiddenDefIds(new Set());
      resetToInitialWindow();
      notifyHiddenSetChanged(new Set(), 'unhideAll', 0);
      setToast({ message: 'All hidden tag specs restored', type: 'success' });
    }, 250);
  }, [notifyHiddenSetChanged, resetToInitialWindow]);

  // Keep `hideBusy` true for the WHOLE hide/unhide operation: from the
  // click through the engine's refill fetch, so the table skeleton (and
  // the panel spinner) cover the entire loading state instead of just the
  // 250ms beat before the fetch starts. Clear it once `engine.refilling`
  // has gone true (fetch started) and back to false (finished). A safety
  // timer prevents a stuck skeleton if a refill never starts.
  const hideRefillArmedRef = useRef(false);
  useEffect(() => {
    if (!hideBusy) { hideRefillArmedRef.current = false; return; }
    if (engine.refilling) { hideRefillArmedRef.current = true; return; }
    if (hideRefillArmedRef.current) { hideRefillArmedRef.current = false; setHideBusy(false); return; }
    const t = window.setTimeout(() => setHideBusy(false), 6000);
    return () => window.clearTimeout(t);
  }, [hideBusy, engine.refilling]);

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
        const tepHeaders: TepHeaders = {          userId: userId ?? '',
          tenantCode: tepConfig.ttpTenantCode,
          languageCode: tepConfig.languageCode,
          timeZone: tepConfig.timeZone,
          requestId: tepConfig.ttpRequestId,
        };
        // Ledger scopes by ClientCode/ErpCode; every other type by bank/side.
        // Also scope by DataSetType so the matching-tags preview only counts
        // this workspace's rows — MT940 sends its whole family (MT940 +
        // TransactionsList), other types just themselves.
        const filteringProperties: FilterProperty[] = [
          ...identityScopeFilters(activeCheckout, 'EQ'),
          dataSetTypeFilter(dataSetTypeScopeValues(activeCheckout.dataSetType ?? DEFAULT_DATA_SET_TYPE)),
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

  // Deliver +N VISIBLE rows. The engine plans the fetch in visible space:
  // it asks for `currentShown + N` visible rows and overfetches by the
  // scoped hidden-row count (capped on both calls), so a +50 click adds
  // 50 rows the operator can actually see even when hidden tag specs are
  // interleaved. One atomic replace per click — old rows stay on screen
  // until the new buffer commits. When the buffer already over-satisfies
  // the new target (e.g. right after an unhide), the rows appear
  // instantly with no fetch. The target persists per checkout, so
  // Refresh / tag toggles keep a Show-all window loaded.
  const loadNVisible = useCallback(async (size: number) => {
    if (size <= 0) return;
    if (!isLiveMode) {
      setVisibleCount((c) => c + size);
      return;
    }
    const shown = Math.min(engine.targetVisible, filteredData.length);
    // Incremental +N / Show all GROW the prefix buffer with a single
    // `{PageIndex:0, PageSize:shown+size}` replace — one request per click,
    // even for +500. (Per-page paging is classic-mode only, via goToPage.)
    await ensureVisible(shown + size);
  }, [isLiveMode, ensureVisible, engine.targetVisible, filteredData]);

  // Classic-mode navigation: make sure the prefix buffer holds enough
  // VISIBLE rows to cover the requested page, then let `visibleData`
  // slice it. No per-page server fetch — pages are windows over the same
  // buffer both modes share, so hidden rows can't desync the page math.
  const goToPage = useCallback((newPage: number) => {
    setCurrentPage(newPage);
    setPageInputValue(String(newPage + 1));
    // Classic (normal) pagination fetches EXACTLY the requested page:
    // `{PageIndex:newPage, PageSize:50}`, replacing the buffer with that
    // page's rows. So page 12 loads 50 rows, not `12*50`. Sample mode
    // paginates by client slice over the fully-loaded buffer (no fetch).
    if (isLiveMode) void engineGoToPage(newPage);
  }, [isLiveMode, engineGoToPage]);

  // Reset visible count / page when filtered data length changes
  // In live + classic pagination mode, data replaces on every page nav — don't reset page from here
  const filteredLen = filteredData.length;

  // Displayed loaded / total counts shared between the header label and
  // the pagination footer. Everything runs in VISIBLE space: loadedNow is
  // the loaded rows the operator can actually see (client analyzeRow
  // hiding is authoritative for display), totalNow is the engine's
  // `totalShowing` — serverTotal minus the SAME-filter-scope hidden count,
  // clamped so loadedNow can never exceed it. The old cross-scope
  // `hiddenForMath` compensation math is gone.
  //
  // When the rule builder has a Validity bound set we collapse both
  // counts to `filteredLen`. The validity filter is enforced client-side
  // (see filteredData), so the visible row count is the only honest
  // number to expose — the backend buffer's `transactions.length` and
  // `totalTransactionsCount` reflect the unfiltered fetch and would read
  // as "27 loaded · 27 total" while the table actually shows 3 rows.
  const validityFilterActive = builderOpen && (!!validityStartDate || !!validityEndDate);
  // Client-side row filters that depend on the analyzeRow pass: when any is
  // active the displayed count must come from `filteredLen`, not the raw
  // buffer length.
  const clientRowFilterActive = showOnlyUntagged || showOnlyMultiTagged || showOnlyDeadEnd || (builderOpen && builderHasContent);
  const displayCounts = useMemo(() => {
    if (validityFilterActive) {
      return { loadedNow: filteredLen, totalNow: filteredLen };
    }
    if (!isLiveMode) {
      // Sample mode: filteredLen already excludes hidden rows; the slice
      // cap (visibleCount) bounds what's on screen.
      return { loadedNow: Math.min(visibleCount, filteredLen), totalNow: filteredLen };
    }
    // "loaded" = visible rows in the buffer. With server-side exclusion the
    // buffer holds only visible rows, so the BUFFER LENGTH is the right
    // count — NOT `filteredLen`, which is derived from the async analyzeRow
    // pass that commits in 500-row chunks and would make Show all / +N
    // appear to load "in increments of 500" while the rows are merely being
    // analyzed (the single fetch already landed). When a client-side row
    // filter (showOnly / builder preview) narrows the view, those filters
    // depend on analysis, so fall back to filteredLen there.
    const loadedBase = clientRowFilterActive ? filteredLen : transactions.length;
    const loadedNow = incrementalPagination
      ? Math.min(engine.targetVisible, loadedBase)
      : loadedBase;
    const totalNow = Math.max(loadedNow, engine.totalShowing ?? 0);
    return { loadedNow, totalNow };
  }, [isLiveMode, visibleCount, filteredLen, incrementalPagination, engine.targetVisible, engine.totalShowing, validityFilterActive, clientRowFilterActive, transactions.length]);

  useEffect(() => {
    if (isLiveMode && !incrementalPagination) return; // page managed by nav controls + filter effect
    setVisibleCount(BATCH_SIZE);
    setCurrentPage(0);
    setPageInputValue('1');
  }, [filteredLen, isLiveMode, incrementalPagination]);

  // Classic page count runs in VISIBLE space (hidden rows excluded), so
  // the pager and the footer counts always agree.
  const classicTotalPages = Math.max(1, Math.ceil(displayCounts.totalNow / BATCH_SIZE));

  // When the visible total shrinks below the current classic page, snap
  // back to the last page that still exists AND fetch it — with per-page
  // buffers the clamped page isn't already loaded (unlike the old prefix
  // buffer), so the display index and the buffer would otherwise disagree.
  // Guarded on totalNow > 0 so a transient 0 mid-fetch doesn't bounce us to
  // page 0.
  useEffect(() => {
    if (!isLiveMode || incrementalPagination) return;
    if (displayCounts.totalNow <= 0) return;
    const clamped = clampPageIndex(currentPage, displayCounts.totalNow, BATCH_SIZE);
    if (clamped !== currentPage) {
      setCurrentPage(clamped);
      setPageInputValue(String(clamped + 1));
      void engineGoToPage(clamped);
    }
  }, [isLiveMode, incrementalPagination, currentPage, displayCounts.totalNow, engineGoToPage]);

  const visibleData = useMemo(() => {
    if (builderOpen) return filteredData;
    if (incrementalPagination) {
      // Incremental mode shows the intended window, not the raw buffer:
      // a hide-triggered refill overfetches (the buffer may briefly hold
      // thousands of rows), but the operator asked to see targetVisible
      // rows — slicing keeps "hide on 50 -> see 50 again" literal.
      return isLiveMode
        ? filteredData.slice(0, engine.targetVisible)
        : filteredData.slice(0, visibleCount);
    }
    // Classic mode. LIVE: the buffer already holds ONLY the current page
    // (goToPage fetched `{PageIndex:currentPage, PageSize:50}` and replaced
    // the buffer), so show it whole — no `currentPage*50` offset, which
    // would slice past a 50-row buffer and render an empty page. SAMPLE:
    // the buffer holds every row, so the offset slice is the page window.
    if (isLiveMode) return filteredData.slice(0, BATCH_SIZE);
    const start = currentPage * BATCH_SIZE;
    return filteredData.slice(start, start + BATCH_SIZE);
  }, [filteredData, visibleCount, isLiveMode, incrementalPagination, currentPage, builderOpen, engine.targetVisible]);

  // NOTE: an empty live preview (no currently-loaded transaction matches the
  // rule) is NOT a save blocker. Operators author rules ahead of the data —
  // transactions ingested later get auto-tagged — so "matches nothing right
  // now" is expected. (The Create/Save gate lives on canCreateFromBuilder,
  // which covers the real blockers: missing type, duplicates, unsaved rows.)

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
        dataSetType: activeCheckout!.dataSetType,
        clientCode: activeCheckout!.clientCode ?? '',
        erpCode: activeCheckout!.erpCode ?? '',
        transactionTypeCode: builder.formState.transactionTypeCode,
        // Preserve the validity range the operator entered inline so it
        // pre-populates the Basic Info Validity section of the save popup.
        // Earlier this was forcibly reset to { '', null }, which wiped any
        // validity dates the operator set in the inline rule builder.
        validity: builder.formState.validity,
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
  // "Show all" pagination confirmation. State holds the pending remaining
  // count so we can render the exact number in the dialog body. Non-null
  // means the dialog is open; null hides it. Above the 1000-row threshold
  // we surface the confirm; at or below we fetch immediately. The
  // overfetch loop in loadNVisible already handles arbitrary sizes.
  const [showAllConfirmRemaining, setShowAllConfirmRemaining] = useState<number | null>(null);
  const SHOW_ALL_CONFIRM_THRESHOLD = 1000;
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
    // row's OpsTag* fields for saved libraries, so any GetTEPTransactions
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
          const tepHeaders: TepHeaders = {            userId: userId ?? '',
            tenantCode: tepConfig.ttpTenantCode,
            languageCode: tepConfig.languageCode,
            timeZone: tepConfig.timeZone,
            requestId: tepConfig.ttpRequestId,
          };
          // Find the inProgressLib and apply the change manually (dispatch is
          // async in React batching).
          const currentLib = libraries.find(
            (l) => l.StatusTag === 'INPROGRESS' && libraryMatchesCheckout(l, activeCheckout)
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
      // engineRefetch replaces the buffer atomically at the current visible
      // target (no blanking, window preserved).
      void engineRefetch();
    }
  }, [dispatch, builder, editingDef, tagClickState, baseFilters, activeCheckout, libraries, refreshIfNeeded, getAuthHeaders, userId, tepConfig, saveBaseline, isLiveMode, engineRefetch, fetchFilterDefinitions, wizardCommentDrafts]);

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
            // Header shows TOTAL SHOWING for the current filter scope plus
            // a "N hidden" suffix. Both numbers come from the engine's
            // same-scope subtraction (totalShowing = serverTotal -
            // hiddenTotal), so the header, footer, and table can never
            // disagree. The hidden tally is filter-scoped: narrow the
            // filters and it reflects the hidden rows inside that slice.
            const displayed = builderOpen && builderHasContent
              ? filteredData.length
              : isLiveMode && totalTransactionsCount != null
                ? displayCounts.totalNow
                : filteredData.length;
            const hiddenSuffix = (() => {
              if (builderOpen) return '';
              if (engine.totalHidden <= 0) return '';
              if (displayCounts.totalNow === 0) {
                return ' · all hidden';
              }
              return ` · ${engine.totalHidden.toLocaleString()} hidden`;
            })();
            return (
              <span className={`text-sm mr-5 shrink-0 text-primary-dark whitespace-nowrap${engine.hiddenCountLoading ? ' animate-pulse' : ''}`}>
                ({displayed.toLocaleString()}{hiddenSuffix})
              </span>
            );
          })()}
          <div className="flex items-center gap-4">
            <Toggle label="Compact mode" checked={relaxedMode} onChange={setRelaxedMode} />
            <Toggle label="Incremental pagination" checked={incrementalPagination} onChange={(v) => {
              // The two modes now hold DIFFERENT buffers — incremental keeps a
              // growing prefix from row 0, classic (live) holds only the
              // current page. Switching from a classic page > 1 back to
              // incremental would otherwise show that page's rows as the
              // "start", so reload page 0 for a clean buffer in both modes.
              setIncrementalPagination(v);
              setCurrentPage(0);
              setPageInputValue('1');
              setVisibleCount(BATCH_SIZE);
              if (isLiveMode) void engineRefetch();
            }} />
            <span data-tour="show-attributes-toggle"><Toggle label="Show attributes" checked={showAttributes} onChange={setShowAttributes} /></span>
            {isLedger(columnPrefsDst) && (
              <Tooltip content="Show every leg of a journal entry when any leg matches your filters, so you always see whole documents." placement="bottom">
                <span><Toggle label="Show full transactions" checked={showFullTransactions} onChange={setShowFullTransactions} /></span>
              </Tooltip>
            )}
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
                  // If a Matching Rules chip filter is active, carry
                  // its rule sets INTO the new rule builder so the
                  // operator can start authoring from the same shape
                  // they were filtering by. IDs are regenerated so
                  // the builder owns its own AndGroup/Condition
                  // identity (the modal's draft state can come back
                  // to life later without colliding). The filter
                  // chip itself is cleared — the builder is now the
                  // authoritative source of those rules, and leaving
                  // the chip active would double-narrow the table
                  // against rules the operator is mid-editing.
                  if (matchingRulesFilter.length > 0) {
                    const seededGroups: AndGroupFormValue[] = matchingRulesFilter.map((g) => ({
                      id: crypto.randomUUID(),
                      conditions: g.conditions.map((c) => ({ ...c, id: crypto.randomUUID() })),
                    }));
                    builder.resetForm();
                    builder.setFormState((prev) => ({ ...prev, ruleGroups: seededGroups }));
                    setMatchingRulesFilter([]);
                  }
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
        onFiltersChange={handleFiltersChange}
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
        leadingActionSlot={isLiveMode ? (
          <div className="flex items-center gap-2">
            {activeCheckout && (matchingTagEntries.length > 0 || matchingTagsListLoading) ? (
              <CurrentTagsDropdown
                entries={matchingTagEntries}
                selectedIds={currentTagFilterIds}
                onChange={setCurrentTagFilterIds}
                loading={matchingTagsListLoading}
                lockedToId={detectedTagsLockedToId}
              />
            ) : null}
            <MatchingRulesFilterButton
              value={matchingRulesFilter}
              onChange={setMatchingRulesFilter}
            />
          </div>
        ) : null}
        // The Detected Tag Specs picker + matching-rules chip live outside
        // DynamicFilters' own state but read as part of the same filter row
        // to the operator — fold them into the Clear-filters affordance so
        // one click resets everything the operator can see.
        extraActiveFilterCount={
          currentTagFilterIds.size
          + (activePillFilters.length > 0 ? 1 : 0)
          + (buildRegexFilterFromRuleGroups(matchingRulesFilter) ? 1 : 0)
        }
        onClearExtraFilters={() => {
          setCurrentTagFilterIds(new Set());
          setActivePillFilters([]);
          setMatchingRulesFilter([]);
        }}
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
                  // Refresh's full contract: clean slate.
                  //   - Reset pagination intent so the refetch lands on
                  //     the default first 50 (drop any prior +N / Show
                  //     all choice).
                  //   - Empty every filter surface so the operator sees
                  //     the same starting view they'd get on a fresh
                  //     tab open: dynamic filter chips, Detected Tag
                  //     Specs selection, Show Only pill filters, and
                  //     the Show Only toggle row.
                  //   - The standard filter-change effect picks up the
                  //     emptied `filters` / `activeExtraFilters`
                  //     dependencies and fires the data refetch
                  //     (page 0, default PAGE_SIZE) — no manual
                  //     fetch call needed here, which avoids the
                  //     double-fetch we'd otherwise get from setFilters
                  //     queuing the effect AND a direct fetch call.
                  engine.resetTargetVisible();
                  setFilters({});
                  setCurrentTagFilterIds(new Set());
                  setActivePillFilters([]);
                  setMatchingRulesFilter([]);
                  setShowOnlyUntagged(false);
                  setShowOnlyMultiTagged(false);
                  setShowOnlyDeadEnd(false);
                  if (!incrementalPagination) {
                    setCurrentPage(0);
                    setPageInputValue('1');
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
            {/* Character view: compact button next to Columns (a sibling
                column-display control). Its on/off switch + per-column picker
                live in the popover so the filter row stays tidy. Renders
                Arabic narrative cells in logical character order; gotcha #30. */}
            {tableColumns.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCharViewMenuOpen((o) => !o)}
                  title="Show Arabic narrative cells in logical character order"
                  aria-pressed={charViewEnabled}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                    charViewEnabled
                      ? 'bg-primary/10 border-primary/30 text-primary-dark dark:text-primary shadow-sm'
                      : 'bg-surface border-border-strong text-body hover:bg-surface-hover'
                  }`}
                >
                  <span className="font-mono text-[11px] leading-none tracking-tight" aria-hidden>حA</span>
                  <span className="hidden lg:inline">Character view</span>
                  {charViewEnabled && (
                    <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-[10px] font-semibold leading-none">
                      {charViewCols.size}
                    </span>
                  )}
                </button>
                {charViewMenuOpen && (
                  <>
                    <DropdownBackdrop onClick={() => setCharViewMenuOpen(false)} />
                    <div className="absolute top-full right-0 mt-1 z-50 w-64 rounded-lg border border-border bg-surface shadow-lg p-3 space-y-2">
                      <Toggle label="Character view" checked={charViewEnabled} onChange={setCharViewEnabled} />
                      <p className="text-[10px] text-muted leading-snug">
                        Renders Arabic (right-to-left) text in narrative cells one character at a time, in logical order, so split positions are clear. English text is left as-is.
                      </p>
                      <div className={charViewEnabled ? '' : 'opacity-50 pointer-events-none'}>
                        <p className="text-[10px] uppercase tracking-wide text-faint mb-1">Columns</p>
                        {CHAR_VIEW_COLUMNS.map((c) => (
                          <label
                            key={c.field}
                            className="flex items-center gap-2 px-1 py-1 text-xs text-body cursor-pointer hover:bg-surface-hover rounded"
                          >
                            <input
                              type="checkbox"
                              checked={charViewCols.has(c.field)}
                              onChange={() =>
                                setCharViewCols((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(c.field)) next.delete(c.field);
                                  else next.add(c.field);
                                  return next;
                                })
                              }
                            />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {tableColumns.length > 0 && (
              <ColumnPicker columns={tableColumns} hiddenColumns={effectiveHiddenColumns} onChange={setHiddenColumns} columnOrder={columnOrder} onColumnOrderChange={setColumnOrder} defaultHiddenColumns={defaultHiddenColumns} onReset={handleColumnReset} lockedVisibleKeys={forcedSideColumnKeys} dataSetType={columnPrefsDst} />
            )}
            {sortOverride && (
              <button
                type="button"
                onClick={() => {
                  setSortOverride(null);
                  setCurrentPage(0);
                  setPageInputValue('1');
                  setVisibleCount(BATCH_SIZE);
                }}
                title={`Sorted by ${humanizeFieldName(sortOverride.field)} ${sortOverride.order === 'ASC' ? 'A→Z' : 'Z→A'}. Click to clear and return to default sort.`}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-primary/30 bg-primary/10 text-primary-dark dark:text-primary-light hover:bg-primary/15 transition-colors whitespace-nowrap"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l6 6M9 3l-6 6" />
                </svg>
                Reset sort
              </button>
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
        const ruleBuilderTepHeaders: TepHeaders = {          userId: userId ?? '',
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
                dataSetType={activeCheckout?.dataSetType ?? builder.formState.dataSetType}
                disabled={isReadOnly}
                triggerClassName="!py-1 !text-xs !max-w-[220px]"
                clearable
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
                  currentBank={activeCheckout?.bank ?? null}
                  currentSide={activeCheckout?.side ?? null}
                  currentDataSetType={activeCheckout?.dataSetType ?? null}
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
                // Note: we intentionally do NOT block saving when zero currently
                // loaded transactions match the rule. Operators author rules
                // ahead of the data — future transactions ingested later get
                // auto-tagged by this rule — so an empty live preview is a
                // valid, expected state, not an error.
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


          {/* Body collapse uses a max-height + opacity transition rather
              than the grid-template-rows 1fr/0fr technique. The grid
              technique animates smoothly visually but, in some browsers,
              keeps the `1fr` track sized to content even when the container
              has no explicit height — which leaves the OUTER builder
              wrapper's borderbox unchanged, so the ResizeObserver below
              never observes the collapse and the table's maxHeight stays
              anchored to the expanded size. max-height definitively
              shrinks the wrapper, the observer picks up the new height,
              and the table grows into the freed space. The cap is set
              generously (2000px) so any realistic builder body fits
              without clipping mid-transition. */}
          <div
            className="overflow-hidden transition-[max-height,opacity] duration-300 ease-out"
            style={{
              // Expanded height tracks the measured body so tall builders
              // (many uncollapsed attributes/rules) never clip the footer.
              // `none` only until the first measurement lands.
              maxHeight: builderCollapsed ? '0px' : (builderBodyHeight != null ? `${builderBodyHeight}px` : 'none'),
              opacity: builderCollapsed ? 0 : 1,
            }}
            aria-hidden={builderCollapsed}
          >
          <div ref={builderBodyRef}>
          <div className="p-5 flex flex-col md:flex-row  flex-1 gap-5">
            {/* Matching rules section */}
            <div className='w-full md:w-1/2 space-y-4'>
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

              {/* Validity section. Sits as a sub-section under Matching
                  Rules in the left half of the body, lining up beside
                  Attributes on the right. The two date inputs feed back
                  into `filters['StatementDate_GTE/LTE']` via the effect
                  above, so the table reflects only rows the rule would
                  actually tag — the same end-state as the operator
                  manually setting the Statement Date filter from the
                  DynamicFilters bar. */}
              <ValidityEditor
                validity={builder.formState.validity}
                onChange={(validity) => builder.updateBasicInfo({ validity })}
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
                libraries={libraries}
                bankSwiftCode={
                  // Editing an existing rule: scope to the parent library's bank.
                  // Creating a new rule: scope to the active checkout's bank.
                  editingParentLib
                    ? getContextValue(editingParentLib.Context, 'BankSwiftCode') ?? null
                    : activeCheckout?.bank ?? null
                }
                characterView={charViewEnabled}
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
                  // While the matching set is recomputing after an Exclude,
                  // lock the whole group: excluding a tag mutates the rule and
                  // the list reloads, so a second click would act on a stale
                  // set. `pointer-events-none` blocks pointer clicks (preview +
                  // ×); `handleExclude` also early-returns to cover keyboard.
                  <div
                    className={`flex flex-wrap gap-1.5 transition-opacity ${matchingTagsLocked ? 'pointer-events-none opacity-50' : ''}`}
                    aria-busy={matchingTagsLocked}
                  >
                    {otherMatchingTagIds.map((id) => {
                      const def = tagDefinitions.find((d) => d.Id === id);
                      if (!def) return null;
                      const source = definitionSourceMap.get(id) ?? 'Backend';
                      const isUserCreated = !originalDefinitionIds?.has(id);
                      const versionInfo = definitionVersions.get(id);
                      const handleExclude = () => {
                        // Ignore further excludes while a previous one is still
                        // reloading the match set (keyboard path; pointer is
                        // already blocked by the container's pointer-events).
                        if (matchingTagsLocked) return;
                        // Exclude lives INSIDE the badge as a × icon;
                        // see TagBadge's `onExclude` prop for the
                        // stopPropagation wiring. This handler just
                        // performs the form-state mutation and
                        // surfaces the result toast.
                        const result = builder.excludeTag(def);
                        if (result.skipped) {
                          // No rule change → the match set won't reload, so
                          // don't engage the lock (it would never clear).
                          setToast({
                            message: result.reason ?? `Could not exclude "${def.Tag}"`,
                            type: 'error',
                          });
                        } else {
                          // Lock the group until the recomputed set lands.
                          setExcludePending(true);
                          // Exclude is a deliberate rule edit. If we're in
                          // tag-click "show all" mode (e.g. after "Discard your
                          // unsaved changes and show all"), `matchingTagsFormState`
                          // drops `ruleGroups`, so the match preview ignores the
                          // rule — the negation we just added would have no
                          // effect and the excluded tag would never drop out.
                          // Exit show-all so the preview re-scopes to the rule.
                          setTagClickState((prev) => (prev?.showingAll ? { ...prev, showingAll: false } : prev));
                          const n = result.conditions.length;
                          setToast({
                            message: `Excluded "${def.Tag}". Added ${n} condition${n === 1 ? '' : 's'} to the rule.`,
                            type: 'success',
                          });
                        }
                      };
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
                              onExclude={handleExclude}
                              excludeTitle={`Exclude "${def.Tag}" — add negative conditions so the current rule stops matching the same rows`}
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
            {/* After Apply Rules: discard the unsaved edits and revert to THIS
                definition's own matches (scoped by OpsTagSpecDefinitionId via
                activeExtraFilters), NOT the whole tag name. Clearing
                rulesetApplied + showingAll and restoring the pre-click filters
                drops the REGEX preview and the tag-name broadening, so the
                table shows exactly the rows this saved definition tags. */}
            {tagClickState?.rulesetApplied && !tagClickState.showingAll && (
              <button
                className='text-[11px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer'
                onClick={() => {
                  if (!tagClickState) return;
                  builder.setFormState(tagClickState.originalFormState);
                  setFilters({ ...tagClickState.preFilters });
                  setTagClickState((prev) => prev ? { ...prev, rulesetApplied: false, rulesetFilters: [], showingAll: false } : prev);
                }}
              >
                Discard your unsaved changes
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

          {/* Footer row. Three-column grid so the centered Collapse stays
              anchored to the row midpoint regardless of whether the
              edit-mode Delete is present — a flex justify-between would
              shift the button left when Delete renders. Collapse mirrors
              the header chevron so operators can free up the table from
              the bottom of a tall builder without scrolling back up. */}
          <div className="px-5 pb-3 grid grid-cols-3 items-center gap-2">
            <div />
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setBuilderCollapsed(true)}
                className="whitespace-nowrap"
                title="Collapse the rule builder to give the table more space"
                aria-label="Collapse rule builder"
              >
                Collapse
              </Button>
            </div>
            <div className="flex justify-end">
              {!isReadOnly && editingDef && (
                <Button
                  variant="danger_ghost"
                  size="xs"
                  onClick={handleRequestDelete}
                  className="whitespace-nowrap dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/40 dark:hover:bg-red-500/20 dark:hover:border-red-500/60"
                  title="Delete this tag rule"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
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
        dataSetType={columnPrefsDst}
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
        getMt940Suggestions={getMt940Suggestions}
        onCloneMt940Suggestion={!isReadOnly ? handleCloneMt940Suggestion : undefined}
        showAttributes={showAttributes}
        relaxedMode={relaxedMode}
        charViewColumns={effectiveCharViewCols}
        hiddenColumns={tableHiddenColumns}
        columnOrder={columnOrder}
        onColumnsReady={setTableColumns}
        onVisibleColumnsReady={setVisibleTableColumns}
        builderHeight={builderHeight}
        loading={loading}
        forceSkeleton={hideBusy || staleScopeBuffer}
        accentHue={190}
//   190 — cyan (default)
// 220 — blue
// 260 — purple
// 340 — pink
// 30 — orange
// 140 — green
        onRowContextMenu={(row, x, y, field) => setContextMenu({ row, x, y, field })}
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
        journalBanding={journalBanding}
        sortOverride={sortOverride}
        onSortChange={(next) => {
          setSortOverride(next);
          // Sort changes invalidate the current page. Snap the operator back
          // to the top of the freshly-ordered dataset in both paginators so
          // they don't land on an empty/mismatched page after the resort.
          setCurrentPage(0);
          setPageInputValue('1');
          setVisibleCount(BATCH_SIZE);
        }}
        columnWidths={columnWidths}
        onColumnWidthChange={(key, width) => {
          setColumnWidths((prev) => {
            const next = { ...prev };
            if (width == null) delete next[key];
            else next[key] = width;
            return next;
          });
        }}
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
        const { loadedNow, totalNow } = displayCounts;
        // Backwards (-N) batch buttons were removed: operators never used
        // them in practice and the trim flow (setTimeout-driven loading
        // flash + visible-ratio scaling against hidden rows) was a
        // maintenance liability. Refresh and the page-scope filters
        // already cover "show me less" use cases. The +N forward batch
        // buttons stay.
        // "Remaining" drives the forward +N batch buttons. Visible scope
        // (totalNow / loadedNow), so the offered increments match what the
        // operator can actually surface; the engine handles the raw-row
        // overfetch under the hood.
        const remaining = Math.max(0, totalNow - loadedNow);
        const fwdBatches = (() => {
          const b = [25, 50, 200, 500].filter((x) => x <= remaining);
          if (b.length === 0 && remaining > 0) b.push(remaining);
          return b;
        })();
        return (
        <div className="flex items-center justify-center gap-3 py-2 mt-1 border border-border bg-surface-secondary rounded-lg">
          {loading || staleScopeBuffer ? (
            <div className="flex items-center gap-3 animate-pulse">
              <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-700" />
              {fwdBatches.length > 0 && <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />}
              {fwdBatches.map((_, i) => (
                <div key={`fwd-skel-${i}`} className="h-5 w-10 rounded bg-gray-200 dark:bg-gray-700" />
              ))}
            </div>
          ) : incrementalPagination ? (
            <>
              <span className="text-xs text-muted">
                <span className="font-medium text-heading">{loadedNow.toLocaleString()}</span>
                {' loaded · '}
                <span className="font-medium text-heading">{totalNow.toLocaleString()}</span>
                {' total'}
              </span>
              {engine.refilling && (
                <span className="text-xs text-muted animate-pulse">refilling…</span>
              )}
              {fwdBatches.length > 0 && (
                <>
                  <span className="text-border">|</span>
                  {fwdBatches.map((size) => (
                    <Button key={size} variant="outline" size="xs" disabled={engine.refilling} onClick={() => loadNVisible(size)}>
                      +{size.toLocaleString()}
                    </Button>
                  ))}
                  {/* Show all — load every remaining row in one go. Past
                      the threshold we gate behind ConfirmDialog so the
                      operator can opt out if they didn't realise how many
                      rows are pending; under the threshold the cost is
                      small enough to skip the prompt. `remaining` is the
                      visible-scope delta computed above so the request
                      mirrors the +N buttons' "visible rows to add"
                      semantics. */}
                  {remaining > 0 && (
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={engine.refilling}
                      title={`Load all ${remaining.toLocaleString()} remaining transactions`}
                      onClick={() => {
                        if (remaining > SHOW_ALL_CONFIRM_THRESHOLD) {
                          setShowAllConfirmRemaining(remaining);
                        } else {
                          loadNVisible(remaining);
                        }
                      }}
                    >
                      Show all
                    </Button>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <Button variant="ghost" size="xs" disabled={currentPage === 0 || engine.refilling} onClick={() => goToPage(currentPage - 1)}>
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
                      goToPage(num - 1);
                    } else {
                      setPageInputValue(String(currentPage + 1));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const num = parseInt(pageInputValue, 10);
                      if (!isNaN(num) && num >= 1 && num <= classicTotalPages) {
                        goToPage(num - 1);
                      } else {
                        setPageInputValue(String(currentPage + 1));
                      }
                    }
                  }}
                />
                of {classicTotalPages.toLocaleString()}
              </span>
              <Button variant="ghost" size="xs" disabled={currentPage >= classicTotalPages - 1 || engine.refilling} onClick={() => goToPage(currentPage + 1)}>
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

      {/* Show all pagination confirmation. Past 1000 remaining rows the
          fetch can chain multiple paginated round trips through the
          overfetch loop, so we surface the count before committing. */}
      <ConfirmDialog
        open={showAllConfirmRemaining != null}
        onClose={() => setShowAllConfirmRemaining(null)}
        onConfirm={() => {
          const n = showAllConfirmRemaining;
          setShowAllConfirmRemaining(null);
          if (n != null && n > 0) loadNVisible(n);
        }}
        title="Load all transactions?"
        message={`This will fetch ${(showAllConfirmRemaining ?? 0).toLocaleString()} more transactions and may take a while. Continue?`}
        confirmLabel="Load all"
      />

      {activeCheckout && shareDialogOpenProp && (
        <ShareLinkDialog
          open={shareDialogOpenProp}
          onClose={onShareDialogClose ?? (() => {})}
          bank={activeCheckout.bank}
          side={activeCheckout.side}
          dataSetType={activeCheckout.dataSetType}
          clientCode={activeCheckout.clientCode}
          erpCode={activeCheckout.erpCode}
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
          onAddMatchingRule={
            builderOpen && !isReadOnly && contextMenu.field
              ? (op) => {
                  const field = contextMenu.field!;
                  builder.appendCondition(field, op, String(contextMenu.row[field] ?? ''));
                  setBuilderCollapsed(false); // reveal the rule set the condition landed in
                  setContextMenu(null);
                }
              : undefined
          }
          matchingRuleHint={
            builderOpen && !isReadOnly && contextMenu.field
              ? `${humanizeFieldName(contextMenu.field)}: ${(() => {
                  const v = String(contextMenu.row[contextMenu.field] ?? '');
                  return v.length > 40 ? `${v.slice(0, 40)}…` : v;
                })()}`
              : undefined
          }
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
        const tepHeaders: TepHeaders = {          userId: userId ?? '',
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
        const tepHeaders: TepHeaders = {          userId: userId ?? '',
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
      {/* Hide / unhide tag spec operations show their loading state via the
          TABLE skeleton (forceSkeleton={hideBusy}) plus the footer skeleton,
          matching the pagination loading look — lighter and more localized
          than the old full-screen blur overlay. `hideBusy` stays true through
          the engine's refill fetch (see the refilling-settle effect). */}
    </div>
    </WizardCommentDraftsProvider>
  );
}
