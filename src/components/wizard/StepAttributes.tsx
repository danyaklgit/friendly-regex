import type { AttributeFormValue, TransactionRow } from '../../types';
import { AttributeEditor } from './AttributeEditor';
import { Button } from '../shared/Button';

interface StepAttributesProps {
  attributes: AttributeFormValue[];
  onAdd: () => void;
  onRemove: (attrId: string) => void;
  onUpdate: (attrId: string, updates: Partial<AttributeFormValue>) => void;
  transactions?: TransactionRow[];
  startCollapsed?: boolean;
}

export function StepAttributes({ attributes, onAdd, onRemove, onUpdate, transactions, startCollapsed }: StepAttributesProps) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">
        Define attributes to extract from transactions when this tag matches.
        Attributes are optional — you can skip this step.
      </p>

      {attributes.length > 0 ? (
        <div className="space-y-3">
          {attributes.map((attr) => (
            <AttributeEditor
              key={attr.id}
              attribute={attr}
              onUpdate={(updates) => onUpdate(attr.id, updates)}
              onRemove={() => onRemove(attr.id)}
              transactions={transactions}
              startCollapsed={startCollapsed && attr.attributeTag.trim().length > 0}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-sm text-gray-500 my-2">No attributes defined yet</p>
        </div>
      )}

      <Button variant="secondary" size="sm" onClick={onAdd} className="mt-4">
        Add Attribute
      </Button>
    </div>
  );
}
