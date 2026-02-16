import type { WizardFormState } from '../../types';
import { Input } from '../shared/Input';
import { Select } from '../shared/Select';
import { STATUS_OPTIONS, CERTAINTY_OPTIONS, SIDE_OPTIONS, TXN_TYPE_OPTIONS, BANK_SWIFT_CODE_OPTIONS } from '../../constants/fields';

interface StepBasicInfoProps {
  formState: WizardFormState;
  onUpdate: (updates: Partial<Pick<WizardFormState, 'tag' | 'side' | 'bankSwiftCode' | 'transactionTypeCode' | 'statusTag' | 'certaintyLevelTag' | 'validity'>>) => void;
}

export function StepBasicInfo({ formState, onUpdate }: StepBasicInfoProps) {
  return (
    <div className="space-y-4">
      <Input
        label="Tag Name"
        placeholder="e.g., A2AIn, PaymentOut"
        value={formState.tag}
        onChange={(e) => onUpdate({ tag: e.target.value })}
      />

      <div className="grid grid-cols-3 gap-4">
        <Select
          label="Side"
          value={formState.side}
          onChange={(e) => onUpdate({ side: e.target.value })}
          options={SIDE_OPTIONS.map((s) => ({ value: s, label: s }))}
        />
        <Select
          label="Bank Swift Code"
          value={formState.bankSwiftCode}
          onChange={(e) => onUpdate({ bankSwiftCode: e.target.value })}
          options={BANK_SWIFT_CODE_OPTIONS.map((s) => ({ value: s, label: s }))}
        />
        <Select
          label="Transaction Type"
          value={formState.transactionTypeCode}
          onChange={(e) => onUpdate({ transactionTypeCode: e.target.value })}
          options={TXN_TYPE_OPTIONS.map((s) => ({ value: s, label: s }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Status"
          value={formState.statusTag}
          onChange={(e) => onUpdate({ statusTag: e.target.value as typeof formState.statusTag })}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
        />
        <Select
          label="Certainty Level"
          value={formState.certaintyLevelTag}
          onChange={(e) => onUpdate({ certaintyLevelTag: e.target.value as typeof formState.certaintyLevelTag })}
          options={CERTAINTY_OPTIONS.map((s) => ({ value: s, label: s }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Start Date"
          type="date"
          value={formState.validity.StartDate}
          onChange={(e) =>
            onUpdate({
              validity: { ...formState.validity, StartDate: e.target.value },
            })
          }
        />
        <Input
          label="End Date (optional)"
          type="date"
          value={formState.validity.EndDate ?? ''}
          onChange={(e) =>
            onUpdate({
              validity: {
                ...formState.validity,
                EndDate: e.target.value || null,
              },
            })
          }
        />
      </div>
    </div>
  );
}
