import { useMemo } from 'react';
import type { AttributeFormValue, TransactionRow } from '../../types';
import { AttributeEditor } from './AttributeEditor';
import { Button } from '../shared/Button';
import { computeDuplicateAttributeIndexes } from '../../utils/attributeFingerprint';

interface StepAttributesProps {
  attributes: AttributeFormValue[];
  onAdd: () => void;
  onRemove: (attrId: string) => void;
  onUpdate: (attrId: string, updates: Partial<AttributeFormValue>) => void;
  transactions?: TransactionRow[];
  startCollapsed?: boolean;
  readOnly?: boolean;
  suggestedAttributeNames?: { name: string; count: number }[];
  suggestedTagName?: string;
}

export function StepAttributes({ attributes, onAdd, onRemove, onUpdate, transactions, startCollapsed, readOnly, suggestedAttributeNames, suggestedTagName }: StepAttributesProps) {
  // For each attribute, the index of the earlier row sharing its (trimmed,
  // case-insensitive) name, or null when it's unique. Only the later
  // duplicate carries the flag so the original stays clean.
  const duplicateOfIndex = useMemo(() => computeDuplicateAttributeIndexes(attributes), [attributes]);

  return (
    <div data-tour="wizard-attributes">
      <p className="text-xs text-muted mb-2">
        Define attributes to extract from transactions when this tag matches.
        Attributes are optional — you can skip this step.
      </p>

      {attributes.length > 0 ? (
        <div className="space-y-1">
          {attributes.map((attr, i) => (
            <AttributeEditor
              key={attr.id}
              attribute={attr}
              onUpdate={(updates) => onUpdate(attr.id, updates)}
              onRemove={() => onRemove(attr.id)}
              transactions={transactions}
              startCollapsed={startCollapsed && attr.attributeTag.trim().length > 0}
              readOnly={readOnly}
              isDuplicateName={duplicateOfIndex[i] !== null}
              suggestedAttributeNames={suggestedAttributeNames}
              suggestedTagName={suggestedTagName}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-4 bg-surface-secondary rounded-lg border border-dashed border-border-strong">
          <p className="text-sm text-muted my-2">No attributes defined yet</p>
        </div>
      )}

      {!readOnly && (
        <Button variant="secondary" size="xs" onClick={onAdd} className="mt-4">
          Add Attribute
        </Button>
      )}
    </div>
  );
}
