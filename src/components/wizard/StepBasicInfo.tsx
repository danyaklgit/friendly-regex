import { useState } from 'react';
import type { WizardFormState } from '../../types';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { TagTreePicker } from '../shared/TagTreePicker';
import { Select } from '../shared/Select';
import { STATUS_OPTIONS, CERTAINTY_OPTIONS, SIDE_OPTIONS, TXN_TYPE_OPTIONS, BANK_SWIFT_CODE_OPTIONS } from '../../constants/fields';

interface StepBasicInfoProps {
  formState: WizardFormState;
  onUpdate: (updates: Partial<Pick<WizardFormState, 'tag' | 'side' | 'bankSwiftCode' | 'transactionTypeCode' | 'statusTag' | 'certaintyLevelTag' | 'validity'>>) => void;
  fromCheckoutContext?: boolean;
}

export function StepBasicInfo({ formState, onUpdate, fromCheckoutContext }: StepBasicInfoProps) {
  const { tagsHierarchy, tagsHierarchyLoading } = useTagSpecs();
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const markTouched = (field: string) => setTouched((prev) => new Set(prev).add(field));

  const isError = (field: string, value: string) =>
    fromCheckoutContext && touched.has(field) && value.trim().length === 0;

  // Tag name is always required
  const isTagError = touched.has('tag') && formState.tag.trim().length === 0;

  return (
    <div className="space-y-4">
      <TagTreePicker
        label="Tag"
        nodes={tagsHierarchy}
        value={formState.tag}
        onChange={(tag) => { onUpdate({ tag }); markTouched('tag'); }}
        loading={tagsHierarchyLoading}
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

    </div>
  );
}
