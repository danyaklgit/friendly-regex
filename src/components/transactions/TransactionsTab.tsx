import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useTransactionData } from '../../hooks/useTransactionData';
import { useWizardForm, fromExistingDefinition } from '../../hooks/useWizardForm';
import type { TagSpecDefinition, TagSpecLibrary, AnalyzedTransaction, WizardFormState, RuleExpression, CheckoutState } from '../../types';
import type { WizardFormResult } from '../../hooks/useWizardForm';
import { analyzeRow } from '../../utils/analyzeRow';
import { regexify, regexifyExtraction, generateExpressionPrompt, generateExtractionPrompt } from '../../utils/regexify';
import { generateExpressionId } from '../../utils/uuid';
import { TransactionTable, ColumnPicker, type ColumnDef } from './TransactionTable';
import { StepRuleExpressions } from '../wizard/StepRuleExpressions';
import { StepAttributes } from '../wizard/StepAttributes';
import { TagWizardModal } from '../wizard/TagWizardModal';
import { Button } from '../shared/Button';
import { Toast } from '../shared/Toast';
import { DynamicFilters } from './DynamicFilters';
import { CheckoutBanner } from '../stats/CheckoutBanner';
import { Toggle } from '../shared/Toggle';

interface TransactionsTabProps {
  activeCheckout?: CheckoutState | null;
  onCheckin?: (bank: string, side: string) => void;
  onRelease?: (bank: string, side: string) => void;
  editFromRules?: { definition: TagSpecDefinition; parentLib: TagSpecLibrary } | null;
  onClearEditFromRules?: () => void;
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
          const prompt = generateExpressionPrompt(c.operation, c.value, c.values, {
            prefix: c.prefix,
            suffix: c.suffix,
          });
          return {
            SourceField: c.sourceField,
            ExpressionPrompt: null,
            ExpressionId: null,
            Regex: regexify(c.operation, c.value, c.values, {
              prefix: c.prefix,
              suffix: c.suffix,
            }),
            RegexDetails: [{ LanguageCode: 'en', Description: prompt }],
          };
        })
    ).filter((group) => group.length > 0),
    Attributes: formState.attributes
      .filter((a) => a.attributeTag.trim().length > 0)
      .map((attr, index) => {
        const prompt = generateExtractionPrompt(attr.extractionOperation, {
          prefix: attr.prefix,
          suffix: attr.suffix,
          pattern: attr.pattern,
        });
        return {
          AttributeTag: attr.attributeTag,
          IsMandatory: attr.isMandatory,
          LOVTag: null,
          ValidationRuleTag: attr.validationRuleTag,
          AttributeRuleExpression: {
            SourceField: attr.sourceField,
            ExpressionPrompt: null,
            ExpressionId: generateExpressionId(id, 'attr', index),
            Regex: regexifyExtraction(attr.extractionOperation, {
              prefix: attr.prefix,
              suffix: attr.suffix,
              pattern: attr.pattern,
            }),
            RegexDetails: [{ LanguageCode: 'en', Description: prompt }],
          },
        };
      }),
  };
}

const BATCH_SIZE = 50;

export function TransactionsTab({ activeCheckout, onCheckin, onRelease, editFromRules, onClearEditFromRules }: TransactionsTabProps) {
  const { libraries, tagDefinitions, originalDefinitionIds, dispatch } = useTagSpecs();
  const { transactions, fieldMeta, loadTransactions, resetToSample, isCustomData, flagDeadEnd } = useTransactionData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rule builder state (reuses the wizard form hook)
  const builder = useWizardForm(undefined, undefined, fieldMeta.sourceFields[0]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [showOnlyUntagged, setShowOnlyUntagged] = useState(false);
  const [showOnlyMultiTagged, setShowOnlyMultiTagged] = useState(false);
  const [showOnlyDeadEnd, setShowOnlyDeadEnd] = useState(false);
  const [showAttributes, setShowAttributes] = useState(true);
  const [relaxedMode, setRelaxedMode] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [tableColumns, setTableColumns] = useState<ColumnDef[]>([]);
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});

  // Base filters from checkout — "clear filters" resets to these instead of empty
  const baseFilters = useMemo(() => {
    if (!activeCheckout) return undefined;
    return {
      BankSwiftCode: new Set([activeCheckout.bank]),
      Side: new Set([activeCheckout.side]),
    };
  }, [activeCheckout]);

  // Apply checkout filters when checkout state changes
  useEffect(() => {
    if (baseFilters) {
      setFilters({ ...baseFilters });
      setShowOnlyUntagged(false);
      setShowOnlyMultiTagged(false);
    }
  }, [baseFilters]);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInitialState, setWizardInitialState] = useState<WizardFormState | undefined>(undefined);
  const [editingDef, setEditingDef] = useState<TagSpecDefinition | undefined>(undefined);
  const [editingParentLib, setEditingParentLib] = useState<TagSpecLibrary | undefined>(undefined);
  const [wizardInitialStep, setWizardInitialStep] = useState<1 | 2 | 3 | 4 | undefined>(undefined);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [wizardFromCheckout, setWizardFromCheckout] = useState(false);

  // Handle edit-from-rules: load definition into builder
  useEffect(() => {
    if (!editFromRules) return;
    const { definition, parentLib } = editFromRules;
    const formState = fromExistingDefinition(definition, parentLib);
    builder.setFormState(formState);
    setEditingDef(definition);
    setEditingParentLib(parentLib);
    setBuilderOpen(true);
    onClearEditFromRules?.();
  }, [editFromRules]);

  // Build the temporary definition from the builder's form state
  const tempDefinition = useMemo(
    () => (builderOpen ? formStateToTempDefinition(builder.formState) : null),
    [builderOpen, builder.formState]
  );

  // Combine real libraries + temp definition wrapped in a synthetic library for analysis
  const allLibraries: TagSpecLibrary[] = useMemo(() => {
    if (tempDefinition) {
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
      return [...libraries, previewLib];
    }
    return libraries;
  }, [libraries, tempDefinition]);

  // Flat definitions including preview (for table column ordering)
  const allDefinitions = useMemo(() => {
    if (tempDefinition) return [...tagDefinitions, tempDefinition];
    return tagDefinitions;
  }, [tagDefinitions, tempDefinition]);

  // Check if builder has any real content
  const builderHasContent = builder.formState.ruleGroups.some((g) =>
    g.conditions.some((c) => c.value.trim().length > 0)
  ) || builder.formState.attributes.some((a) => a.attributeTag.trim().length > 0);

  // Analyze all rows

  const analyzedData: AnalyzedTransaction[] = useMemo(
    () =>
      transactions.map((row) => ({
        row,
        analysis: analyzeRow(row, allLibraries),
      })).filter(item => (builderOpen && builderHasContent) ? Object.keys(item.analysis.attributes ?? {}).includes('Preview') : true),
    [transactions, allLibraries]
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
      } else {
        result = result.filter((item) => {
          const val = item.row[field];
          return val !== null && val !== undefined && selectedValues.has(String(val));
        });
      }
    }

    return result;
  }, [analyzedData, showOnlyUntagged, showOnlyMultiTagged, showOnlyDeadEnd, filters]);

  // Reset visible count when filters or data change
  const filteredLen = filteredData.length;
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [filteredLen]);

  const visibleData = useMemo(
    () => filteredData.slice(0, visibleCount),
    [filteredData, visibleCount]
  );
  const hasMore = visibleCount < filteredLen;

  // Flatten temp definition's rule expressions for highlighting
  const highlightExpressions: RuleExpression[] | undefined = useMemo(() => {
    if (!tempDefinition) return undefined;
    return tempDefinition.TagRuleExpressions.flat();
  }, [tempDefinition]);

  // Compute sticky fields from builder ruleset conditions only
  const stickyFields = useMemo(() => {
    if (!builderOpen) return undefined;
    const fields = new Set<string>();

    for (const group of builder.formState.ruleGroups) {
      for (const c of group.conditions) {
        if (c.value.trim().length > 0) fields.add(c.sourceField);
      }
    }

    return fields.size > 0 ? fields : undefined;
  }, [builderOpen, builder.formState]);

  const handleCreateFromBuilder = useCallback(() => {
    const isFromCheckout = !!activeCheckout && !editingDef;
    const state: WizardFormState = {
      ...builder.formState,
      ...(isFromCheckout ? {
        side: activeCheckout!.side,
        bankSwiftCode: activeCheckout!.bank,
        transactionTypeCode: '',
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

  const handleDiscard = useCallback(() => {
    setBuilderOpen(false);
    setEditingDef(undefined);
    setEditingParentLib(undefined);
  }, []);

  const handleWizardSave = useCallback((result: WizardFormResult) => {
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
  }, [dispatch, builder, editingDef]);

  const handleWizardClose = useCallback(() => {
    setWizardOpen(false);
    setWizardInitialState(undefined);
    setEditingDef(undefined);
    setEditingParentLib(undefined);
    setWizardInitialStep(undefined);
    setWizardFromCheckout(false);
  }, []);

  // Click a tag badge in the table → load into rule builder for live editing
  const handleTagClick = useCallback((tagName: string, definitionId?: string) => {
    // Find the specific matched definition, or fall back to first with that tag name
    for (const lib of libraries) {
      const def = definitionId
        ? lib.TagSpecDefinitions.find((d) => d.Id === definitionId)
        : lib.TagSpecDefinitions.find((d) => d.Tag === tagName);
      if (def) {
        const formState = fromExistingDefinition(def, lib);
        builder.setFormState(formState);
        setEditingDef(def);
        setEditingParentLib(lib);
        setBuilderOpen(true);
        return;
      }
    }
  }, [libraries, builder]);

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
      {activeCheckout && onCheckin && onRelease && (
        <CheckoutBanner bank={activeCheckout.bank} side={activeCheckout.side} onRelease={onRelease} onCheckin={onCheckin} />
      )}
      <div className="flex items-center justify-between mb-1">
        <div className='flex items-center gap-2'>
          {!builderOpen && <h2 className="text-base font-semibold text-gray-900">Transactions</h2>}
          {!builderOpen && <span className='text-sm mr-5'>({filteredData.length})</span>}
          {!builderOpen && <Toggle label="Show attributes" checked={showAttributes} onChange={setShowAttributes} />}
          {!builderOpen && <Toggle label="Compact mode" checked={relaxedMode} onChange={setRelaxedMode} />}
          {!builderOpen && (
            <div className="flex items-center gap-5 ml-4 text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-400 text-[8px] font-semibold text-gray-400">i</span>
                Data as provided by the bank(s)
              </span>
              <span className="flex items-center gap-1 text-blue-500">
                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-blue-400 text-[8px] font-semibold text-blue-500">i</span>
                Enhanced data based on existing tag definitions
              </span>
              <span className="flex items-center gap-1 text-orange-500">
                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-orange-400 text-[8px] font-semibold text-orange-500">i</span>
                Data as customized by the user
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileUpload}
          />
          {!builderOpen && <Button variant="primary" size="sm" onClick={() => {
            fileInputRef.current?.click()
          }}>
            Upload Data
          </Button>}
          {isCustomData && (
            <Button variant="danger" size="sm" onClick={resetToSample}>
              Reset to Sample
            </Button>
          )}
          {!builderOpen && (
            <Button
              variant="secondary"
              size="sm"
              disabled={!(activeCheckout && onCheckin && onRelease)}
              onClick={() => {
                setShowOnlyUntagged(false)
                setShowOnlyMultiTagged(false)
                setBuilderOpen(true)
              }}
            >
              Test a Rule
            </Button>
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
          endSlot={tableColumns.length > 0 ? (
            <ColumnPicker columns={tableColumns} hiddenColumns={hiddenColumns} onChange={setHiddenColumns} />
          ) : undefined}
        />
      {/* )} */}

      {/* Rule builder panel */}
      {builderOpen && (
        <div className="flex flex-col mb-6 border border-blue-200 rounded-xl bg-blue-50/50 overflow-hidden">
          <div className="px-5 py-3 bg-blue-100/60 border-b border-blue-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-blue-900">Rule Builder</h3>
              <p className="text-xs text-blue-700">
                Build rules and see their effect on the table in real time.
              </p>
            </div>
            <div className="flex flex-col md:flex-row items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleDiscard}>
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateFromBuilder}
                disabled={!builderHasContent}
              >
                {editingDef ? `Save changes for "${editingDef.Tag}"` : 'Create Rule with current settings'}
              </Button>
            </div>
          </div>


          <div className="p-5 flex flex-col md:flex-row  flex-1 gap-5">
            {/* Matching rules section */}
            <div className='w-full md:w-1/2'>
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Matching Rules
              </h4>
              <StepRuleExpressions
                ruleGroups={builder.formState.ruleGroups}
                onAddGroup={builder.addRuleGroup}
                onRemoveGroup={builder.removeRuleGroup}
                onAddCondition={builder.addCondition}
                onRemoveCondition={builder.removeCondition}
                onUpdateCondition={builder.updateCondition}
                startCollapsed={!!editingDef}
              />
            </div>

            {/* Attributes section */}
            <div className='w-full md:w-1/2 relative'>
              {/* <div className='absolute flex bg-blue-50/50 w-full h-full opacity-100 rounded-sm'></div> */}
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
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

          <span className='flex justify-center items-baseline w-full text-slate-500 text-xs pb-2'>
            Records: <span className='text-blue-500 pl-1 text-base'>{filteredData.length}</span>
          </span>

        </div>
      )}

      <TransactionTable
        data={visibleData}
        tagDefinitions={allDefinitions}
        originalDefinitionIds={originalDefinitionIds}
        highlightExpressions={highlightExpressions}
        stickyFields={stickyFields}
        onTagClick={handleTagClick}
        onFlagDeadEnd={flagDeadEnd}
        showAttributes={showAttributes}
        relaxedMode={relaxedMode}
        hiddenColumns={hiddenColumns}
        onColumnsReady={setTableColumns}
      />

      {hasMore && (
        <div className="flex items-center justify-center gap-3 py-2 mt-1 border border-gray-200 bg-gray-50 rounded-lg">
          <span className="text-xs text-gray-500">
            Showing {visibleCount.toLocaleString()} of {filteredLen.toLocaleString()}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setVisibleCount((c) => c + BATCH_SIZE)}>
            Show more
          </Button>
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
