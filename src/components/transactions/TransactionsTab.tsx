import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useTransactionData } from '../../hooks/useTransactionData';
import { useWizardForm } from '../../hooks/useWizardForm';
import type { TagSpecDefinition, TagSpecLibrary, AnalyzedTransaction, WizardFormState, RuleExpression } from '../../types';
import type { WizardFormResult } from '../../hooks/useWizardForm';
import { analyzeRow } from '../../utils/analyzeRow';
import { regexify, regexifyExtraction, generateExpressionPrompt, generateExtractionPrompt } from '../../utils/regexify';
import { generateExpressionId } from '../../utils/uuid';
import { TransactionTable } from './TransactionTable';
import { StepRuleExpressions } from '../wizard/StepRuleExpressions';
import { StepAttributes } from '../wizard/StepAttributes';
import { TagWizardModal } from '../wizard/TagWizardModal';
import { Button } from '../shared/Button';
import { Toast } from '../shared/Toast';
import { DynamicFilters } from './DynamicFilters';

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

export function TransactionsTab() {
  const { libraries, tagDefinitions, dispatch } = useTagSpecs();
  const { transactions, fieldMeta, loadTransactions, resetToSample, isCustomData } = useTransactionData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rule builder state (reuses the wizard form hook)
  const builder = useWizardForm(undefined, undefined, fieldMeta.sourceFields[0]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [showOnlyUntagged, setShowOnlyUntagged] = useState(false);
  const [showOnlyMultiTagged, setShowOnlyMultiTagged] = useState(false);
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInitialState, setWizardInitialState] = useState<WizardFormState | undefined>(undefined);
  const [editingDef, setEditingDef] = useState<TagSpecDefinition | undefined>(undefined);
  const [editingParentLib, setEditingParentLib] = useState<TagSpecLibrary | undefined>(undefined);
  const [wizardInitialStep, setWizardInitialStep] = useState<1 | 2 | 3 | 4 | undefined>(undefined);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
  }, [analyzedData, showOnlyUntagged, showOnlyMultiTagged, filters]);

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
    setWizardInitialState({ ...builder.formState });
    setEditingDef(undefined);
    setEditingParentLib(undefined);
    setWizardInitialStep(undefined);
    setWizardOpen(true);
  }, [builder.formState]);

  const handleDiscard = useCallback(() => {
    setBuilderOpen(false);
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
    setBuilderOpen(false);
    builder.resetForm();
  }, [dispatch, builder, editingDef]);

  const handleWizardClose = useCallback(() => {
    setWizardOpen(false);
    setWizardInitialState(undefined);
    setEditingDef(undefined);
    setEditingParentLib(undefined);
    setWizardInitialStep(undefined);
  }, []);

  // Click a tag badge in the table → open its definition in edit mode at Review (step 4)
  const handleTagClick = useCallback((tagName: string) => {
    // Find the first matching definition and its parent library
    for (const lib of libraries) {
      const def = lib.TagSpecDefinitions.find((d) => d.Tag === tagName);
      if (def) {
        setEditingDef(def);
        setEditingParentLib(lib);
        setWizardInitialState(undefined);
        setWizardInitialStep(4);
        setWizardOpen(true);
        return;
      }
    }
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
      <div className="flex items-center justify-between mb-1">
        <div className='flex items-center gap-2'>
          {!builderOpen && <h2 className="text-base font-semibold text-gray-900">Transactions</h2>}
          {!builderOpen && <span className='text-sm'>{filteredData.length}</span>}
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
            <Button variant="secondary" size="sm" onClick={() => {
              setShowOnlyUntagged(false)
              setShowOnlyMultiTagged(false)
              setBuilderOpen(true)
            }}>
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
                Create Rule with current settings
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
        highlightExpressions={highlightExpressions}
        stickyFields={stickyFields}
        onTagClick={handleTagClick}
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
          onSave={handleWizardSave}
          onClose={handleWizardClose}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
