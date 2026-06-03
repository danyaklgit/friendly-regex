import { useState } from 'react';
import type { WizardFormState } from '../../types';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { TagTreePicker } from '../shared/TagTreePicker';
import { Select } from '../shared/Select';
import { CERTAINTY_OPTIONS, SIDE_OPTIONS, TXN_TYPE_OPTIONS, BANK_SWIFT_CODE_OPTIONS } from '../../constants/fields';
import { WizardCommentIconButton } from './WizardCommentIconButton';
import { WIZARD_DEFINITION_FORM_KEY } from '../../context/WizardCommentDraftsContext';
import { ValidityEditor } from './ValidityEditor';

interface StepBasicInfoProps {
  formState: WizardFormState;
  onUpdate: (updates: Partial<Pick<WizardFormState, 'tag' | 'side' | 'bankSwiftCode' | 'transactionTypeCode' | 'statusTag' | 'certaintyLevelTag' | 'validity'>>) => void;
  fromCheckoutContext?: boolean;
  /** Read-only flag for the entire step. When true, all writable controls
   *  are disabled and the +Add / Remove / per-picker × affordances on the
   *  Validity section are suppressed. The wizard modal isn't opened in
   *  read-only contexts today, but the prop is accepted so future callers
   *  can honor the contract without changes here. */
  readOnly?: boolean;
  libraryIdForComments?: string | null;
  definitionIdForComments?: string;
}

export function StepBasicInfo({
  formState,
  onUpdate,
  fromCheckoutContext,
  readOnly,
  libraryIdForComments,
  definitionIdForComments,
}: StepBasicInfoProps) {
  const { tagsHierarchy, tagsHierarchyLoading } = useTagSpecs();
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const markTouched = (field: string) => setTouched((prev) => new Set(prev).add(field));

  // Tag name is always required
  const isTagError = touched.has('tag') && formState.tag.trim().length === 0;

  return (
    <div className="space-y-4">
      <div data-tour="wizard-tag-picker">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TagTreePicker
              label="Tag"
              nodes={tagsHierarchy}
              value={formState.tag}
              onChange={(tag) => { onUpdate({ tag }); markTouched('tag'); }}
              loading={tagsHierarchyLoading}
              required
              error={isTagError}
              collapseOnSelect
            />
          </div>
          {libraryIdForComments && (
            <div className="pb-1">
              <WizardCommentIconButton
                formKey={WIZARD_DEFINITION_FORM_KEY}
                kind="definition"
                targetLabel={formState.tag || 'New tag'}
                persistedTarget={
                  definitionIdForComments
                    ? {
                        TagSpecLibraryId: libraryIdForComments,
                        TagSpecDefinitionId: definitionIdForComments,
                      }
                    : null
                }
                title="Comment on this tag (queued until Save)"
              />
            </div>
          )}
        </div>
      </div>

      <div data-tour="wizard-basic-info-fields" className="space-y-4">
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
          <div data-tour="wizard-transaction-type">
            <Select
              label="Transaction Type"
              value={formState.transactionTypeCode}
              onChange={(e) => { onUpdate({ transactionTypeCode: e.target.value }); markTouched('transactionTypeCode'); }}
              onBlur={() => markTouched('transactionTypeCode')}
              options={TXN_TYPE_OPTIONS.map((s) => ({ value: s, label: s }))}
              placeholder="Select transaction type"
              disabled={fromCheckoutContext}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Certainty Level"
            value={formState.certaintyLevelTag}
            onChange={(e) => onUpdate({ certaintyLevelTag: e.target.value as typeof formState.certaintyLevelTag })}
            options={CERTAINTY_OPTIONS.map((s) => ({ value: s, label: s }))}
          />
        </div>

        <ValidityEditor
          validity={formState.validity}
          onChange={(validity) => onUpdate({ validity })}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
