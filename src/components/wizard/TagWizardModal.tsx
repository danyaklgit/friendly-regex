import type { TagSpecDefinition, TagSpecLibrary, WizardFormState, WizardStep } from '../../types';
import type { WizardFormResult } from '../../hooks/useWizardForm';
import { useWizardForm } from '../../hooks/useWizardForm';
import { useTransactionData } from '../../hooks/useTransactionData';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { WizardStepIndicator } from './WizardStepIndicator';
import { StepBasicInfo } from './StepBasicInfo';
import { StepRuleExpressions } from './StepRuleExpressions';
import { StepAttributes } from './StepAttributes';
import { StepReview } from './StepReview';

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
        // Rule expressions are optional. A transaction-type-only tag is valid.
        return true;
      case 3:
        return true; // Attributes are optional
      case 4:
        return true;
      default:
        return false;
    }
  };

  const canProceed = () => isStepValid(wizard.currentStep);

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
            <Button data-tour="wizard-next-button" variant="primary" onClick={wizard.goNext} disabled={!canProceed()}>
              Next
            </Button>
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
