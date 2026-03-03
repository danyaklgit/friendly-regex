import type { WizardFormState } from '../../types';
import { Badge } from '../shared/Badge';
import { RulePreview } from './RulePreview';

interface StepReviewProps {
  formState: WizardFormState;
  isEditing: boolean;
}

export function StepReview({ formState, isEditing }: StepReviewProps) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Review your {isEditing ? 'changes' : 'new tag rule'} before saving.
      </p>

      {/* Basic Info */}
      <div className="bg-surface-secondary rounded-lg p-4 border border-border">
        <h4 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
          Basic Information
        </h4>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted">Tag Name</span>
          <span className="font-medium text-heading">{formState.tag || '(not set)'}</span>

          <span className="text-muted">Side / Bank</span>
          <span className="text-heading">
            {formState.side} / {formState.bankSwiftCode}
          </span>

          <span className="text-muted">Transaction Type</span>
          <span className="text-heading">
            {formState.transactionTypeCode || '(not set)'}
          </span>

          <span className="text-muted">Status</span>
          <Badge
            variant={
              formState.statusTag === 'ACTIVE'
                ? 'success'
                : formState.statusTag === 'DRAFT'
                ? 'warning'
                : 'default'
            }
          >
            {formState.statusTag}
          </Badge>

          <span className="text-muted">Certainty</span>
          <Badge
            variant={
              formState.certaintyLevelTag === 'HIGH'
                ? 'success'
                : formState.certaintyLevelTag === 'MEDIUM'
                ? 'warning'
                : 'default'
            }
          >
            {formState.certaintyLevelTag}
          </Badge>

          <span className="text-muted">Validity</span>
          <span className="text-heading">
            {formState.validity.StartDate}
            {formState.validity.EndDate ? ` to ${formState.validity.EndDate}` : ' (no end date)'}
          </span>
        </div>
      </div>

      {/* Rules + Attributes Preview */}
      <div className="bg-surface-secondary rounded-lg p-4 border border-border">
        <RulePreview ruleGroups={formState.ruleGroups} attributes={formState.attributes} />
      </div>
    </div>
  );
}
