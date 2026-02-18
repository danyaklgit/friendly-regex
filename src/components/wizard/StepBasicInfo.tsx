import { useState } from 'react';
import type { WizardFormState } from '../../types';
import { Input } from '../shared/Input';
import { Select } from '../shared/Select';
import { STATUS_OPTIONS, CERTAINTY_OPTIONS, SIDE_OPTIONS, TXN_TYPE_OPTIONS, BANK_SWIFT_CODE_OPTIONS } from '../../constants/fields';

interface StepBasicInfoProps {
  formState: WizardFormState;
  onUpdate: (updates: Partial<Pick<WizardFormState, 'tag' | 'side' | 'bankSwiftCode' | 'transactionTypeCode' | 'statusTag' | 'certaintyLevelTag' | 'validity'>>) => void;
  fromCheckoutContext?: boolean;
}

export function StepBasicInfo({ formState, onUpdate, fromCheckoutContext }: StepBasicInfoProps) {
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const markTouched = (field: string) => setTouched((prev) => new Set(prev).add(field));

  const isError = (field: string, value: string) =>
    fromCheckoutContext && touched.has(field) && value.trim().length === 0;

  // Tag name is always required
  const isTagError = touched.has('tag') && formState.tag.trim().length === 0;

  return (
    <div className="space-y-4">
      <Input
        label="Tag Name"
        placeholder="e.g., A2AIn, PaymentOut"
        value={formState.tag}
        onChange={(e) => { onUpdate({ tag: e.target.value }); markTouched('tag'); }}
        onBlur={() => markTouched('tag')}
        required
        error={isTagError}
      />

      <div className="grid grid-cols-3 gap-4">
        <Select
          label="Side"
          value={formState.side}
          onChange={(e) => onUpdate({ side: e.target.value })}
          options={SIDE_OPTIONS.map((s) => ({ value: s, label: s }))}
          disabled={fromCheckoutContext}
        />
        <Select
          label="Bank Swift Code"
          value={formState.bankSwiftCode}
          onChange={(e) => onUpdate({ bankSwiftCode: e.target.value })}
          options={BANK_SWIFT_CODE_OPTIONS.map((s) => ({ value: s, label: s }))}
          disabled={fromCheckoutContext}
        />
        <Select
          label="Transaction Type"
          value={formState.transactionTypeCode}
          onChange={(e) => { onUpdate({ transactionTypeCode: e.target.value }); markTouched('transactionTypeCode'); }}
          onBlur={() => markTouched('transactionTypeCode')}
          options={
            fromCheckoutContext
              ? [{ value: '', label: 'Select...' }, ...TXN_TYPE_OPTIONS.map((s) => ({ value: s, label: s }))]
              : TXN_TYPE_OPTIONS.map((s) => ({ value: s, label: s }))
          }
          required={fromCheckoutContext}
          error={isError('transactionTypeCode', formState.transactionTypeCode)}
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
          onChange={(e) => {
            onUpdate({ validity: { ...formState.validity, StartDate: e.target.value } });
            markTouched('startDate');
          }}
          onBlur={() => markTouched('startDate')}
          required={fromCheckoutContext}
          error={isError('startDate', formState.validity.StartDate)}
        />
        <Input
          label="End Date"
          type="date"
          value={formState.validity.EndDate ?? ''}
          onChange={(e) => {
            onUpdate({
              validity: {
                ...formState.validity,
                EndDate: e.target.value || null,
              },
            });
            markTouched('endDate');
          }}
          onBlur={() => markTouched('endDate')}
          required={fromCheckoutContext}
          error={isError('endDate', formState.validity.EndDate ?? '')}
        />
      </div>
    </div>
  );
}
