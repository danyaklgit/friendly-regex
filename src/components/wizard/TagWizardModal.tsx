import type { TagSpecDefinition, TagSpecLibrary, WizardFormState, WizardStep } from '../../types';
import type { WizardFormResult } from '../../hooks/useWizardForm';
import { useWizardForm } from '../../hooks/useWizardForm';
import { useTransactionData } from '../../hooks/useTransactionData';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';
import { WizardStepIndicator } from './WizardStepIndicator';
import { StepBasicInfo } from './StepBasicInfo';
import { StepRuleExpressions } from './StepRuleExpressions';
import { StepAttributes } from './StepAttributes';
import { StepReview } from './StepReview';
import { hasDuplicateGroups, hasWithinGroupConditionDuplicates } from '../../utils/ruleFingerprint';
import { hasDuplicateAttributeNames } from '../../utils/attributeFingerprint';

interface TagWizardModalProps {
  existingDef?: TagSpecDefinition;
  parentLib?: TagSpecLibrary;
  initialFormState?: WizardFormState;
  initialStep?: WizardStep;
  fromCheckoutContext?: boolean;
  onSave: (result: WizardFormResult) => void;
  onClose: () => void;
}

export function TagWizardModal({ existingDef, parentLib, initialFormState, initialStep, fromCheckoutContext, onSave, onClose }: TagWizardModalProps) {
  const { fieldMeta } = useTransactionData();
  const wizard = useWizardForm(existingDef, initialFormState, fieldMeta.sourceFields[0], parentLib, initialStep);

  // Duplicate detection: rule sets, within-group conditions, attribute names.
  // Each step that surfaces the offending UI gates its own Next button; the
  // final-step Create/Save button gates on the combined state. Per-row banners
  // (RuleGroupEditor, ConditionEditor, AttributeEditor) tell the user what to
  // fix; these gates just prevent moving past or saving a broken state.
  const hasRuleDuplicates =
    hasDuplicateGroups(wizard.formState.ruleGroups)
    || hasWithinGroupConditionDuplicates(wizard.formState.ruleGroups);
  const hasAttributeDuplicates = hasDuplicateAttributeNames(wizard.formState.attributes);
  const hasAnyDuplicates = hasRuleDuplicates || hasAttributeDuplicates;

  const isStepValid = (step: WizardStep): boolean => {
    switch (step) {
      case 1:
        // Transaction type is always required: a tag with only a transaction
        // type is a valid rule (matches every row of that type), so it must
        // be set even when the rest of the wizard is empty.
        return (
          wizard.formState.tag.trim().length > 0 &&
          wizard.formState.side.trim().length > 0 &&
          wizard.formState.bankSwiftCode.trim().length > 0 &&
          wizard.formState.transactionTypeCode.trim().length > 0
        );
      case 2:
        // Rule expressions are optional, but if any duplicate exists the user
        // must fix it before continuing — otherwise they'd carry a broken
        // ruleset through to the Review step.
        return !hasRuleDuplicates;
      case 3:
        // Attributes are optional; duplicates block forward progress.
        return !hasAttributeDuplicates;
      case 4:
        return !hasAnyDuplicates;
      default:
        return false;
    }
  };

  const canProceed = () => isStepValid(wizard.currentStep);

  // Reason shown when the Next or Create button is disabled. Step 1 has its
  // own required-field treatment so we only need to label the duplicate case.
  const nextBlockedReason = (() => {
    if (wizard.currentStep === 2 && hasRuleDuplicates) {
      return 'Fix or remove the duplicate rule sets or conditions flagged above before continuing.';
    }
    if (wizard.currentStep === 3 && hasAttributeDuplicates) {
      return 'Rename or remove the duplicate attribute flagged above before continuing.';
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
    const result = wizard.toTagSpecDefinition();
    onSave(result);
  };

  return (
    <Modal
      open
      onClose={onClose}
      fullHeight
      title={wizard.isEditing ? `Edit Rule: ${existingDef?.Tag} (${existingDef?.Id})` : 'Create New Rule'}
      footer={
        <>
          <Button data-tour="wizard-cancel-button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex-1" />
          {wizard.currentStep > 1 && (
            <Button data-tour="wizard-back-button" variant="secondary" onClick={wizard.goBack}>
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
              <Button data-tour="wizard-next-button" variant="primary" onClick={wizard.goNext} disabled={!canProceed()}>
                Next
              </Button>
            )
          ) : hasAnyDuplicates ? (
            <Tooltip
              content="Fix or remove the duplicate rule sets, conditions, or attributes flagged earlier before saving."
              placement="top"
            >
              <span>
                <Button data-tour="wizard-create-button" variant="primary" disabled>
                  {wizard.isEditing ? 'Save Changes' : 'Create Rule'}
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Button data-tour="wizard-create-button" variant="primary" onClick={handleFinish}>
              {wizard.isEditing ? 'Save Changes' : 'Create Rule'}
            </Button>
          )}
        </>
      }
    >
      <WizardStepIndicator currentStep={wizard.currentStep} onStepClick={wizard.goToStep} canReachStep={canReachStep} />

      {wizard.currentStep === 1 && (
        <StepBasicInfo formState={wizard.formState} onUpdate={wizard.updateBasicInfo} fromCheckoutContext={fromCheckoutContext} />
      )}

      {wizard.currentStep === 2 && (
        <div data-tour="wizard-step-2-content">
          <StepRuleExpressions
            ruleGroups={wizard.formState.ruleGroups}
            onAddGroup={wizard.addRuleGroup}
            onRemoveGroup={wizard.removeRuleGroup}
            onAddCondition={wizard.addCondition}
            onRemoveCondition={wizard.removeCondition}
            onUpdateCondition={wizard.updateCondition}
          />
        </div>
      )}

      {wizard.currentStep === 3 && (
        <StepAttributes
          attributes={wizard.formState.attributes}
          onAdd={wizard.addAttribute}
          onRemove={wizard.removeAttribute}
          onUpdate={wizard.updateAttribute}
        />
      )}

      {wizard.currentStep === 4 && (
        <StepReview formState={wizard.formState} isEditing={wizard.isEditing} />
      )}
    </Modal>
  );
}
