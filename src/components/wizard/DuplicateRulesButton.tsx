import { useState } from 'react';
import type { TagSpecDefinition } from '../../types';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { SourceTagPickerModal } from './SourceTagPickerModal';

interface DuplicateRulesButtonProps {
  /** Number of rule sets currently in the form — triggers confirm when > 0. */
  currentRuleGroupCount: number;
  /** Number of attributes currently in the form — triggers confirm when > 0. */
  currentAttributeCount: number;
  /** Apply the chosen source definition's rules + attributes to the form. */
  onApplyTemplate: (def: TagSpecDefinition) => void;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  'data-tour'?: string;
}

export function DuplicateRulesButton({
  currentRuleGroupCount,
  currentAttributeCount,
  onApplyTemplate,
  size = 'sm',
  className,
  ...rest
}: DuplicateRulesButtonProps) {
  const { tagDefinitions } = useTagSpecs();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<TagSpecDefinition | null>(null);

  const hasExistingContent = currentRuleGroupCount > 0 || currentAttributeCount > 0;

  const handlePickerSelect = (def: TagSpecDefinition) => {
    setPickerOpen(false);
    if (hasExistingContent) {
      setPendingTemplate(def);
    } else {
      onApplyTemplate(def);
    }
  };

  const handleConfirmReplace = () => {
    if (pendingTemplate) onApplyTemplate(pendingTemplate);
    setPendingTemplate(null);
  };

  return (
    <>
      <Button
        variant="outline"
        size={size}
        onClick={() => setPickerOpen(true)}
        className={className}
        data-tour={rest['data-tour']}
      >
        Duplicate Rules From Tag
      </Button>

      <SourceTagPickerModal
        open={pickerOpen}
        definitions={tagDefinitions}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
      />

      <ConfirmDialog
        open={!!pendingTemplate}
        onClose={() => setPendingTemplate(null)}
        onConfirm={handleConfirmReplace}
        title="Replace existing rules?"
        message={
          pendingTemplate
            ? `Replace your current ${currentRuleGroupCount} rule set(s) and ${currentAttributeCount} attribute(s) with the rules from "${pendingTemplate.Tag}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Replace"
        variant="primary"
      />
    </>
  );
}
