import { useState, useMemo, useCallback, useRef } from 'react';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useTransactionData } from '../../hooks/useTransactionData';
import { useWizardForm } from '../../hooks/useWizardForm';
import type { TagSpecDefinition, AnalyzedTransaction, WizardFormState, RuleExpression } from '../../types';
import { analyzeRow } from '../../utils/analyzeRow';
import { regexify, regexifyExtraction, generateExpressionPrompt, generateExtractionPrompt } from '../../utils/regexify';
import { generateId, generateExpressionId } from '../../utils/uuid';
import { TransactionTable } from './TransactionTable';
import { StepRuleExpressions } from '../wizard/StepRuleExpressions';
import { StepAttributes } from '../wizard/StepAttributes';
import { TagWizardModal } from '../wizard/TagWizardModal';
import { Button } from '../shared/Button';
import { Toggle } from '../shared/Toggle';
import { Toast } from '../shared/Toast';

function formStateToTempDefinition(formState: WizardFormState): TagSpecDefinition | null {
  const hasCondition = formState.ruleGroups.some((g) =>
    g.conditions.some((c) => c.value.trim().length > 0)
  );
  const hasAttribute = formState.attributes.some((a) => a.attributeTag.trim().length > 0);
  if (!hasCondition && !hasAttribute) return null;

  const id = -1; // Sentinel ID for the temporary rule
  return {
    Id: id,
    Tag: 'Preview',
    Context: { Side: 'CR', TxnType: 'TRF' },
    StatusTag: 'ACTIVE',
    CertaintyLevelTag: 'MEDIUM',
    Validity: {
      StartDate: '2000-01-01',
      EndDate: null,
    },
    TagRuleExpressions: formState.ruleGroups.map((group) =>
      group.conditions
        .filter((c) => c.value.trim().length > 0)
        .map((c) => ({
          SourceField: c.sourceField,
          ExpressionPrompt: generateExpressionPrompt(c.operation, c.value, c.values, {
            prefix: c.prefix,
            suffix: c.suffix,
          }),
          ExpressionId: null,
          Regex: regexify(c.operation, c.value, c.values, {
            prefix: c.prefix,
            suffix: c.suffix,
          }),
        }))
    ).filter((group) => group.length > 0),
    Attributes: formState.attributes
      .filter((a) => a.attributeTag.trim().length > 0)
      .map((attr, index) => ({
        AttributeTag: attr.attributeTag,
        IsMandatory: attr.isMandatory,
        DataType: attr.dataType,
        AttributeRuleExpression: {
          SourceField: attr.sourceField,
          ExpressionPrompt: generateExtractionPrompt(attr.extractionOperation, {
            prefix: attr.prefix,
            suffix: attr.suffix,
            pattern: attr.pattern,
          }),
          ExpressionId: generateExpressionId(id, 'attr', index),
          Regex: regexifyExtraction(attr.extractionOperation, {
            prefix: attr.prefix,
            suffix: attr.suffix,
            pattern: attr.pattern,
          }),
        },
      })),
  };
}

export function TransactionsTab() {
  const { tagDefinitions, dispatch } = useTagSpecs();
  const { transactions, fieldMeta, loadTransactions, resetToSample, isCustomData } = useTransactionData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rule builder state (reuses the wizard form hook)
  const builder = useWizardForm(undefined, undefined, fieldMeta.sourceFields[0]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [showOnlyUntagged, setShowOnlyUntagged] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInitialState, setWizardInitialState] = useState<WizardFormState | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);

  // Build the temporary definition from the builder's form state
  const tempDefinition = useMemo(
    () => (builderOpen ? formStateToTempDefinition(builder.formState) : null),
    [builderOpen, builder.formState]
  );

  // Combine real definitions + temp definition for analysis
  const allDefinitions = useMemo(() => {
    // if (tempDefinition) return [...tagDefinitions, tempDefinition];
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
        analysis: analyzeRow(row, allDefinitions),
      })).filter(item => (builderOpen && builderHasContent) ? Object.keys(item.analysis.attributes ?? {}).includes('Preview') : true),
    [transactions, allDefinitions]
  );

  // Filter: show only untagged rows
  const filteredData = useMemo(() => {
    if (!showOnlyUntagged) return analyzedData;
    return analyzedData.filter((item) => item.analysis.tags.length === 0);
  }, [analyzedData, showOnlyUntagged]);

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
    setWizardOpen(true);
  }, [builder.formState]);

  const handleDiscard = useCallback(() => {
    setBuilderOpen(false);
  }, []);

  const handleWizardSave = useCallback((def: TagSpecDefinition) => {
    def.Id = generateId();
    dispatch({ type: 'ADD', payload: def });
    setWizardOpen(false);
    setWizardInitialState(undefined);
    setBuilderOpen(false);
    builder.resetForm();
    setToast(`Tag '${def.Tag}' created`);
  }, [dispatch, builder]);

  const handleWizardClose = useCallback(() => {
    setWizardOpen(false);
    setWizardInitialState(undefined);
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed?.Transactions && Array.isArray(parsed.Transactions)) {
          loadTransactions(parsed.Transactions);
          setToast(`Loaded ${parsed.Transactions.length} transactions`);
        } else {
          setToast('Invalid format: expected { "Transactions": [...] }');
        }
      } catch {
        setToast('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [loadTransactions]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className='flex items-center gap-2'>
          {!builderOpen && <h2 className="text-base font-semibold text-gray-900">Transactions</h2>}
          {/* <p className="text-sm text-gray-500">
            Tags and attributes are computed automatically based on your defined rules.
          </p> */}
          {!builderOpen && <span className='text-sm'>{filteredData.length}</span>}
          {!builderOpen && <Toggle
            label="Show only untagged"
            checked={showOnlyUntagged}
            onChange={setShowOnlyUntagged}
          />}
          
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
            alert('Please make sure you\'re uploading a json with this format \n {\n "Transactions": [ ]\n } ')
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
              setBuilderOpen(true)
            }}>
              Test a Rule
            </Button>
          )}
        </div>
      </div>

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

      <TransactionTable data={filteredData} tagDefinitions={allDefinitions} highlightExpressions={highlightExpressions} stickyFields={stickyFields} />

      {wizardOpen && (
        <TagWizardModal
          initialFormState={wizardInitialState}
          onSave={handleWizardSave}
          onClose={handleWizardClose}
        />
      )}

      {toast && <Toast message={toast} type="success" onClose={() => setToast(null)} />}
    </div>
  );
}
