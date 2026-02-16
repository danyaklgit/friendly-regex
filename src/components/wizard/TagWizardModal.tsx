import type { TagSpecDefinition, WizardFormState, WizardStep } from '../../types';
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
  initialFormState?: WizardFormState;
  onSave: (def: TagSpecDefinition) => void;
  onClose: () => void;
}

export function TagWizardModal({ existingDef, initialFormState, onSave, onClose }: TagWizardModalProps) {
  const { fieldMeta } = useTransactionData();
  const wizard = useWizardForm(existingDef, initialFormState, fieldMeta.sourceFields[0]);

  const isStepValid = (step: WizardStep): boolean => {
    switch (step) {
      case 1:
        return wizard.formState.tag.trim().length > 0;
      case 2:
        return wizard.formState.ruleGroups.some((g) =>
          g.conditions.some((c) => c.value.trim().length > 0)
        );
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
    const def = wizard.toTagSpecDefinition();
    onSave(def);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={wizard.isEditing ? `Edit Tag: ${existingDef?.Tag}` : 'Create New Tag'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex-1" />
          {wizard.currentStep > 1 && (
            <Button variant="secondary" onClick={wizard.goBack}>
              Back
            </Button>
          )}
          {wizard.currentStep < 4 ? (
            <Button variant="primary" onClick={wizard.goNext} disabled={!canProceed()}>
              Next
            </Button>
          ) : (
            <Button variant="primary" onClick={handleFinish}>
              {wizard.isEditing ? 'Save Changes' : 'Create Tag'}
            </Button>
          )}
        </>
      }
    >
      <WizardStepIndicator currentStep={wizard.currentStep} onStepClick={wizard.goToStep} canReachStep={canReachStep} />

      {wizard.currentStep === 1 && (
        <StepBasicInfo formState={wizard.formState} onUpdate={wizard.updateBasicInfo} />
      )}

      {wizard.currentStep === 2 && (
        <StepRuleExpressions
          ruleGroups={wizard.formState.ruleGroups}
          onAddGroup={wizard.addRuleGroup}
          onRemoveGroup={wizard.removeRuleGroup}
          onAddCondition={wizard.addCondition}
          onRemoveCondition={wizard.removeCondition}
          onUpdateCondition={wizard.updateCondition}
        />
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
