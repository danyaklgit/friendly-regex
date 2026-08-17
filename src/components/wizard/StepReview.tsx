import type { WizardFormState } from '../../types';
import { Badge } from '../shared/Badge';
import { RulePreview } from './RulePreview';
import { isLedger } from '../../utils/libraryIdentity';

/** Render a validity range as plain text for the Review summary. Single-
 *  sided ranges fall back to "From <date>" / "Until <date>" and the
 *  fully-empty case surfaces "No validity" so the row always reads as a
 *  positive answer instead of being missing. */
function formatValidity(start: string | null, end: string | null): string {
  if (start && end) return `${start} to ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return 'No validity';
}

interface StepReviewProps {
  formState: WizardFormState;
  isEditing: boolean;
}

export function StepReview({ formState, isEditing }: StepReviewProps) {
  return (
    <div data-tour="wizard-review" className="space-y-5">
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

          <span className="text-muted">{isLedger(formState.dataSetType) ? 'Client / ERP' : 'Side / Bank'}</span>
          <span className="text-heading">
            {isLedger(formState.dataSetType)
              ? `${formState.clientCode} / ${formState.erpCode}`
              : `${formState.side} / ${formState.bankSwiftCode}`}
          </span>

          <span className="text-muted">Transaction Type</span>
          <span className="text-heading">
            {formState.transactionTypeCode || '(not set)'}
          </span>

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
            {formatValidity(formState.validity.StartDate, formState.validity.EndDate)}
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
