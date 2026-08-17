import { useState } from 'react';
import type { TagSpecDefinition, TagSpecLibrary, WizardFormState, WizardStep } from '../../types';
import type { WizardFormResult } from '../../hooks/useWizardForm';
import { useWizardForm } from '../../hooks/useWizardForm';
import { useTransactionData } from '../../hooks/useTransactionData';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useAuth } from '../../context/AuthContext';
import { useTepConfig } from '../../context/TepConfigContext';
import { CommentsProvider } from '../../context/CommentsContext';
import type { TepHeaders } from '../../api/transactions';
import type { TagSpecCommentTarget } from '../../types/comments';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';
import { CommentSearchTrigger } from '../comments/CommentSearchTrigger';
import { CommentSearchPanel } from '../comments/CommentSearchPanel';
import { isLedger } from '../../utils/libraryIdentity';
import { WizardStepIndicator } from './WizardStepIndicator';
import { StepBasicInfo } from './StepBasicInfo';
import { StepRuleExpressions } from './StepRuleExpressions';
import { StepAttributes } from './StepAttributes';
import { StepReview } from './StepReview';
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

interface TagWizardModalProps {
  existingDef?: TagSpecDefinition;
  parentLib?: TagSpecLibrary;
  initialFormState?: WizardFormState;
  initialStep?: WizardStep;
  fromCheckoutContext?: boolean;
  onSave: (result: WizardFormResult) => void;
  onClose: () => void;
  /** True while the parent is awaiting the TagSpecLibrarySave round-trip —
   *  disables the Save button + Cancel so the modal can't be dismissed
   *  mid-flight, and surfaces a spinner on the Save button. */
  saving?: boolean;
}

export function TagWizardModal({ existingDef, parentLib, initialFormState, initialStep, fromCheckoutContext, onSave, onClose, saving = false }: TagWizardModalProps) {
  const { fieldMeta, transactions, isLiveMode } = useTransactionData();
  const { extractionMethods } = useLovAttributes();
  const auth = useAuth();
  const tepConfig = useTepConfig();
  const wizard = useWizardForm(existingDef, initialFormState, fieldMeta.sourceFields[0], parentLib, initialStep, extractionMethods);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  // Mirror the table's "Character view" preference (read once on open — the
  // wizard has no toggle of its own) so the extraction/transformation previews
  // show the character breakdown only when the operator has it enabled.
  const [characterView] = useState(() => {
    try { return localStorage.getItem('tep:charView') === 'true'; } catch { return false; }
  });

  const authHeader = auth.getAuthHeaders().Authorization ?? '';
  const commentsAuthToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  const commentsTepHeaders: TepHeaders = {
    userId: auth.userId ?? '',
    tenantCode: tepConfig.ttpTenantCode,
    languageCode: tepConfig.languageCode,
    timeZone: tepConfig.timeZone,
    requestId: tepConfig.ttpRequestId,
  };
  const commentsLibraryId = parentLib?.Id ?? null;

  // Each step that surfaces the offending UI gates its own Next button; the
  // final-step Create/Save button gates on the combined state. Two classes of
  // problem block save:
  //   * Duplicates (rule sets, within-group conditions, attribute names) —
  //     per-row banners in the editors surface where to fix.
  //   * Incomplete rows — "+ Add" placeholders the user never finished
  //     filling. Saving those would persist empty conditions / attributes
  //     that re-open as edit forms forever after.
  const hasRuleDuplicates =
    hasDuplicateGroups(wizard.formState.ruleGroups)
    || hasWithinGroupConditionDuplicates(wizard.formState.ruleGroups);
  const hasAttributeDuplicates = hasDuplicateAttributeNames(wizard.formState.attributes);
  const hasIncompleteRule =
    hasIncompleteCondition(wizard.formState.ruleGroups)
    || hasEmptyRuleGroup(wizard.formState.ruleGroups);
  const hasIncompleteAttr = hasIncompleteAttribute(wizard.formState.attributes);
  const hasAnyDuplicates = hasRuleDuplicates || hasAttributeDuplicates;
  const hasAnyIncomplete = hasIncompleteRule || hasIncompleteAttr;
  const hasAnyBlockingIssue = hasAnyDuplicates || hasAnyIncomplete;

  const isStepValid = (step: WizardStep): boolean => {
    switch (step) {
      case 1: {
        // Transaction type is always required: a tag with only a transaction
        // type is a valid rule (matches every row of that type), so it must
        // be set even when the rest of the wizard is empty.
        // Validity is optional; when both bounds are set the range must not
        // be inverted. Lexicographic compare on YYYY-MM-DD ISO strings is
        // sufficient (no Date parsing). Either bound being null or empty
        // short-circuits to valid — single-sided ranges are allowed.
        const { StartDate, EndDate } = wizard.formState.validity;
        const validityValid = !StartDate || !EndDate || StartDate <= EndDate;
        // Library identity depends on the DataSetType: Ledger rules are keyed
        // by (Client, ERP) and carry NO bank/side, so requiring side/bank
        // there would permanently disable Next.
        const identityValid = isLedger(wizard.formState.dataSetType)
          ? wizard.formState.clientCode.trim().length > 0 &&
            wizard.formState.erpCode.trim().length > 0
          : wizard.formState.side.trim().length > 0 &&
            wizard.formState.bankSwiftCode.trim().length > 0;
        return (
          wizard.formState.tag.trim().length > 0 &&
          identityValid &&
          wizard.formState.transactionTypeCode.trim().length > 0 &&
          validityValid
        );
      }
      case 2:
        // Rule expressions are optional, but a duplicate OR an unfinished
        // placeholder rule set blocks forward progress — both would otherwise
        // carry through to Review and be persisted on save.
        return !hasRuleDuplicates && !hasIncompleteRule;
      case 3:
        // Attributes are optional; duplicates and incomplete rows block.
        return !hasAttributeDuplicates && !hasIncompleteAttr;
      case 4:
        return !hasAnyBlockingIssue;
      default:
        return false;
    }
  };

  const canProceed = () => isStepValid(wizard.currentStep);

  // Reason shown when the Next or Create button is disabled. Step 1 has its
  // own required-field treatment so we only need to label the issues from
  // step 2 onward. Incomplete-row reasons take precedence over duplicate
  // reasons since a row that isn't filled in yet can't meaningfully be a
  // duplicate either.
  const nextBlockedReason = (() => {
    if (wizard.currentStep === 1) {
      const { StartDate, EndDate } = wizard.formState.validity;
      if (StartDate && EndDate && StartDate > EndDate) {
        return 'Valid To cannot be earlier than Valid From.';
      }
    }
    if (wizard.currentStep === 2) {
      if (hasIncompleteRule) {
        return 'Finish filling (or remove) the unsaved rule set before continuing.';
      }
      if (hasRuleDuplicates) {
        return 'Fix or remove the duplicate rule sets or conditions flagged above before continuing.';
      }
    }
    if (wizard.currentStep === 3) {
      if (hasIncompleteAttr) {
        return 'Finish filling (or remove) the unsaved attribute before continuing.';
      }
      if (hasAttributeDuplicates) {
        return 'Rename or remove the duplicate attribute flagged above before continuing.';
      }
    }
    return null;
  })();

  const canReachStep = (targetStep: WizardStep): boolean => {
    if (targetStep <= wizard.currentStep) return true;
    for (let s = 1; s < targetStep; s++) {
      if (!isStepValid(s as WizardStep)) return false;
    }
    return true;
  };

  const handleFinish = () => {
    const result = wizard.toTagSpecDefinition(commentsLibraryId);
    onSave(result);
  };

  const body = (
    <>
      <WizardStepIndicator currentStep={wizard.currentStep} onStepClick={wizard.goToStep} canReachStep={canReachStep} />

      {wizard.currentStep === 1 && (
        <StepBasicInfo
          formState={wizard.formState}
          onUpdate={wizard.updateBasicInfo}
          fromCheckoutContext={fromCheckoutContext}
          libraryIdForComments={commentsLibraryId}
          definitionIdForComments={existingDef?.Id}
        />
      )}

      {wizard.currentStep === 2 && (
        <div data-tour="wizard-step-2-content">
          <StepRuleExpressions
            ruleGroups={wizard.formState.ruleGroups}
            onAddGroup={wizard.addRuleGroup}
            onRemoveGroup={wizard.removeRuleGroup}
            onCloneGroup={wizard.cloneRuleGroup}
            onAddCondition={wizard.addCondition}
            onRemoveCondition={wizard.removeCondition}
            onUpdateCondition={wizard.updateCondition}
            libraryId={commentsLibraryId ?? undefined}
            definitionId={existingDef?.Id}
          />
        </div>
      )}

      {wizard.currentStep === 3 && (
        <StepAttributes
          attributes={wizard.formState.attributes}
          onAdd={wizard.addAttribute}
          onRemove={wizard.removeAttribute}
          onClone={wizard.cloneAttribute}
          onUpdate={wizard.updateAttribute}
          onReorder={wizard.reorderAttributes}
          transactions={transactions}
          libraryId={commentsLibraryId ?? undefined}
          definitionId={existingDef?.Id}
          tagSpecKind={parentLib?.StatusTag === 'INPROGRESS' ? 'ops' : 'active'}
          characterView={characterView}
        />
      )}

      {wizard.currentStep === 4 && (
        <StepReview formState={wizard.formState} isEditing={wizard.isEditing} />
      )}
    </>
  );

  const wrappedBody = commentsLibraryId ? (
    <CommentsProvider
      libraryId={commentsLibraryId}
      authToken={commentsAuthToken}
      tepHeaders={commentsTepHeaders}
      eager
    >
      {body}
    </CommentsProvider>
  ) : (
    body
  );

  const searchTarget: TagSpecCommentTarget | null = commentsLibraryId
    ? {
        TagSpecLibraryId: commentsLibraryId,
        TagSpecDefinitionId: null,
        TagRuleExpressionId: null,
        AttributeTag: null,
      }
    : null;

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      fullHeight
      title={wizard.isEditing ? `Edit Rule: ${existingDef?.Tag} (${existingDef?.Id})` : 'Create New Rule'}
      headerAction={
        isLiveMode && searchTarget && !saving ? (
          <CommentSearchTrigger onClick={() => setSearchPanelOpen(true)} title="Search comments" size="sm" />
        ) : undefined
      }
      footer={
        <>
          <Button data-tour="wizard-cancel-button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <div className="flex-1" />
          {wizard.currentStep > 1 && (
            <Button data-tour="wizard-back-button" variant="secondary" onClick={wizard.goBack} disabled={saving}>
              Back
            </Button>
          )}
          {wizard.currentStep < 4 ? (
            nextBlockedReason ? (
              <Tooltip content={nextBlockedReason} placement="top">
                <span>
                  <Button data-tour="wizard-next-button" variant="primary" disabled>
                    Next
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button data-tour="wizard-next-button" variant="primary" onClick={wizard.goNext} disabled={!canProceed() || saving}>
                Next
              </Button>
            )
          ) : hasAnyBlockingIssue ? (
            <Tooltip
              content={
                hasAnyIncomplete
                  ? 'Finish filling (or remove) the unsaved rule set or attribute before saving.'
                  : 'Fix or remove the duplicate rule sets, conditions, or attributes flagged earlier before saving.'
              }
              placement="top"
            >
              <span>
                <Button data-tour="wizard-create-button" variant="primary" disabled>
                  {wizard.isEditing ? 'Save Changes' : 'Create Rule'}
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Button
              data-tour="wizard-create-button"
              variant="primary"
              onClick={handleFinish}
              disabled={saving}
              className="inline-flex items-center gap-2"
            >
              {saving && (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {saving
                ? (wizard.isEditing ? 'Saving…' : 'Creating…')
                : (wizard.isEditing ? 'Save Changes' : 'Create Rule')}
            </Button>
          )}
        </>
      }
    >
      {wrappedBody}
      {searchTarget && (
        <CommentSearchPanel
          open={searchPanelOpen}
          target={searchTarget}
          onClose={() => setSearchPanelOpen(false)}
        />
      )}
    </Modal>
  );
}
